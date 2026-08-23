# Analysis: Auto-detect and load .vscode/mcp.json as an editable configuration source

## Goal

Add a `load -> edit -> save` round trip for the workspace `.vscode/mcp.json` to the configuration panel,
fronted by a configuration-source switcher and an auto-detection banner, without regressing the current
settings-driven editing and one-way export.

## Current Behavior

- The webview (`vscode-extension/src/webview.ts`) edits one settings scope at a time. `setupWebview`
  tracks `currentScope` (`Global`/`Workspace`), posts an `init` message with values from
  `readSettingsForScope` plus the `setKeys` / `setSelectKeys` / `setArrayKeys` "explicitly set" hints,
  and handles inbound messages: `ready`, `scopeChange`, `scopeChangeRequest` (the dirty-edit guard via
  `vscode.window.showWarningMessage({modal:true})`), `save`, and the export triggers `generateConfig` /
  `writeMcpJson` / `showCommand`.
- The sticky header renders a `Save to: Workspace / User` radio and an "Overridable" isolation chip
  (`webview.ts` lines ~469-497). There is no notion of a non-settings source.
- Settings <-> CLI args is one-directional. `buildServerArgs` / `buildLaunchSpec`
  (`vscode-extension/src/argsBuilder.ts`) turn a `Wcli0Settings` into a launcher command + flags. There
  is no inverse (args -> settings).
- `writeWorkspaceMcpJson` (`vscode-extension/src/commands.ts`) already does the safe write half of the
  round trip: reads the file, parses JSONC via `parseJsonc`, refuses a non-object root or non-object
  `servers`, warns before discarding comments, sets `servers.wcli0 = entry`, and writes back. It derives
  the entry from settings read for the form scope (`readExportSettings`).
- The provider (`vscode-extension/src/mcpProvider.ts`) registers the server from settings only; it never
  reads the committed `mcp.json`. Detection helpers exist for related concerns: `homeConfigExists`,
  `cwdConfigExists`, `configFileIsLoadable`.

## Feasibility

Feasible and well-scaffolded. The write half (REQ-4) reuses `writeWorkspaceMcpJson`'s existing logic
nearly verbatim. The detection (REQ-2) is a small read + `parseJsonc` + `servers.wcli0` presence check.
The genuinely new piece is the reverse parser (REQ-3): turning an `mcp.json` entry's
`command`/`args`/`cwd`/`env` back into a `Wcli0Settings`. Because the extension owns the forward mapping
(`buildServerArgs`), a paired inverse is tractable and round-trip testable; unknown flags fall through to
`extraArgs` so nothing is lost. The UI work (REQ-1, REQ-5..REQ-7) extends the existing message protocol
and sticky header rather than rebuilding the form.

## Approach

Add a small source model and a reverse parser, then extend the webview protocol so the host can drive the
form from either a settings scope or a file.

### Approach A (recommended): source model + paired reverse parser

A new `src/configSource.ts` defines the source kinds (`settings` | `mcpJson`), detection
(`detectWorkspaceMcpJson(folder)` returning `{ uri, hasWcli0 }`), and the reverse parser
`parseMcpEntry(entry): Wcli0Settings` built on a `parseServerArgs(args)` inverse of `buildServerArgs`.
The webview gains source state alongside `currentScope`; `init` carries the active source, the detected
sources, and (for a file source) values produced by `parseMcpEntry`. Save routes to a refactored
`writeMcpJsonFromSettings(settings, folder, ...)` extracted from `writeWorkspaceMcpJson`.

| Advantages | Disadvantages |
| ---------- | ------------- |
| Reuses the existing safe-merge writer and dirty-guard patterns | A reverse arg parser is new surface with edge cases (`--opt=value`, repeated flags, negations) |
| Round-trippable and unit-testable against `buildServerArgs` | Hand-written `mcp.json` may use flags the form cannot model (mitigated by `extraArgs` passthrough) |
| Keeps one-source-at-a-time, so "where does Save go" stays unambiguous | Webview message protocol grows (new message types) |

### Approach B: open mcp.json as a text document only

Skip the form entirely for files; just open `.vscode/mcp.json` in a text editor with a banner.

| Advantages | Disadvantages |
| ---------- | ------------- |
| Minimal code; no reverse parser | Does not satisfy "edit it in the form" / the mockups; no validation or guided editing |

### Approach C: full source framework now (files of any kind, config.json too)

Build the whole mockup set (04 browse, 05 config.json) in one task.

| Advantages | Disadvantages |
| ---------- | ------------- |
| One cohesive delivery of the source concept | Much larger; config.json reverse-map (per-shell/profiles) is a separate hard problem; contradicts the requested mockup-02 scope |

Approach A is recommended: it delivers the requested auto-detect + round trip on a model that later tasks
(browse, config.json) can extend.

## Implementation Notes

- Reverse parser must mirror the quirks `buildServerArgs` emits: `--option=value` form for dash-prefixed
  values (`pushOption`), repeated `--allowedDir` / `--blockedCommand` / etc., `--no-enableTruncation`
  negations, `--yolo` / `--unsafe` -> `safetyMode`, transport flags (`--transport`, `--http-host`,
  `--http-port`, `--sse-*`), and the npx prefix `-y <packageSpec>`. Anything unrecognized accumulates in
  `extraArgs` (round-trips through the existing forward path).
- Launch method inference: `command === 'npx'` with a leading `-y` -> `npx`; `command === 'node'` ->
  `node` (first arg is the script path); otherwise `custom` (command + leading non-flag args ->
  `customArgs`, until the first recognized server flag).
- A detected entry that references a `--config` file (or whose form maps to per-shell/profiles) cannot be
  fully represented; surface a non-blocking note and keep `--config` in `configFile` / `extraArgs`.
  Editing that referenced file is the future mockup-05 task.
- Save path: extract the body of `writeWorkspaceMcpJson` after settings-resolution into
  `writeMcpJsonFromSettings(settings, folder, configFileLoadable?)`; the existing command builds settings
  from scope and calls it (no behavior change), the file-source save builds settings from the form
  payload (like `applySettings` collects) and calls it. The file save must NOT call `config.update`.
- Source state lives next to `currentScope` in `setupWebview`. The `init` payload gains
  `source: { kind, uri?, label }` and `detected: ConfigSource[]`. New inbound messages: `selectSource`
  / `loadSource` (with dirty guard, reusing the `scopeChangeRequest` modal pattern) and `saveToFile`.
- `onDidChangeConfiguration` re-post (`post(true)`) must not clobber a file source: when the active
  source is a file, an external settings change should not reload the form from settings.
- Keep the home config strictly read-only: include it in `detected` with a `readOnly: true` flag the UI
  renders disabled; never accept it as a `loadSource`/`saveToFile` target on the host side.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Reverse parser drops or mangles flags a hand-written mcp.json uses | Unmodeled flags pass through to `extraArgs`; round-trip unit tests; a note when `--config`/per-shell is referenced |
| Save overwrites a user's hand-formatted/commented mcp.json | Reuse existing refuse-and-warn logic (`parseJsonc`, comment warning, non-object guards) unchanged |
| Source/scope state divergence causes a stale post to overwrite edits | Mirror existing dirty-guard discipline; gate external re-posts when a file source is active |
| Home config accidentally editable | Host-side guard rejects it as a load/save target regardless of UI |
| Webview protocol growth breaks existing tests | Add new message types additively; keep `ready`/`save`/export messages working |

## Test Strategy

- Unit (`test/unit/configSource.test.cjs`): detection on present/absent/malformed/no-`wcli0` files;
  `parseServerArgs` / `parseMcpEntry` for npx/node/custom, stdio/http/sse, repeated and `=`-form flags,
  negations, and unknown-flag passthrough to `extraArgs`; round-trip against `buildLaunchSpec`.
- Unit (`test/unit/commands.test.cjs`): `writeMcpJsonFromSettings` preserves other servers, refuses a
  non-object root/`servers`, warns on comments; never calls `config.update`.
- Unit (`test/unit/webview.test.cjs`): `init` carries detected sources; banner shown only when a wcli0
  entry exists; `selectSource`/`loadSource` populate from a file; `saveToFile` routes to the file writer;
  dirty guard fires on source switch; home config not offered as a save target.
- Integration (`test/integration/mcpJson.test.js`): with a fixture `.vscode/mcp.json` containing
  `servers.wcli0`, the extension detects it and a save-back round trip preserves a second server entry.
