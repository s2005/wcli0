# PRD: Auto-detect and load .vscode/mcp.json as an editable configuration source

## Objective

Let the wcli0 configuration panel detect an existing workspace `.vscode/mcp.json` that already defines a
`servers.wcli0` entry, surface a one-click banner to load it, and let the user edit it and save the
changes back to that file. This adds a `load -> edit -> save` round trip alongside today's write-only
`new -> export` path, anchored by a new "configuration source" switcher that always makes clear what the
form is editing and where Save will write. Scope is the mockup 02 (auto-detect on open) and the minimal
mockup 03 (edit/save the detected file) needed to make detection useful.

## Background

The extension is settings-driven today. The webview form (`vscode-extension/src/webview.ts`) only ever
edits VS Code settings (`wcli0.*`) at the User or Workspace scope, and files are produced one-way by the
Export tab: `wcli0: Write .vscode/mcp.json` (`writeWorkspaceMcpJson` in
`vscode-extension/src/commands.ts`) and `wcli0: Generate config.json` (`generateConfigFile`). There is
no way to open an existing `.vscode/mcp.json`, see it in the form, edit it, and save it back. A team that
already committed an `mcp.json` cannot round-trip it through the panel.

The mockups in `vscode-extension/docs/mockups/` propose a "configuration source bar": a header that
names the active source (VS Code Settings, the workspace `.vscode/mcp.json`, or a file opened
explicitly) and routes Save to that source. Mockup 02 (`02-autodetect-mcp-json.html`) covers the
detection banner and the source switcher menu; mockup 03 (`03-editing-mcp-json.html`) covers editing the
file and saving back.

The existing writer already contains the hard parts of safe `mcp.json` editing: JSONC parse
(`parseJsonc`), preserve other `servers.*` entries, refuse a non-object root or non-object `servers`,
and warn before dropping comments. What is missing is the reverse direction (parse an `mcp.json`
`servers.wcli0` entry back into the form's settings model) and the UI to drive load/save against a file
rather than a settings scope.

Source: feature request to support `load -> edit -> export` for `.vscode/mcp.json`; mockup set in
`vscode-extension/docs/mockups/` (the `index.html` source table). Side-by-side simultaneous
settings + file editing is explicitly deferred to a future task.

## Requirements

### REQ-1: Configuration source model and switcher

Introduce a "configuration source" concept the form edits one at a time. The source bar shows the active
source (kind + path) and a switcher listing: VS Code Settings, the detected workspace `.vscode/mcp.json`
(when present), and explicit actions. The current behavior (editing settings, with the
User/Workspace scope radio) becomes the `settings` source and remains the default when nothing is
detected.

### REQ-2: Auto-detect .vscode/mcp.json with a wcli0 entry

On panel open, the host reads `${workspaceFolder}/.vscode/mcp.json` (tolerating JSONC via `parseJsonc`)
and reports whether `servers.wcli0` exists. When it does, the form shows a detection banner offering a
one-click "Load & edit .vscode/mcp.json". Detection never mutates the file and never blocks the panel
when the file is absent, unreadable, or malformed.

### REQ-3: Load a mcp.json wcli0 entry into the form

Loading the detected source parses the `servers.wcli0` entry back into the settings model that drives the
form: `type` -> transport mode; `command`/`args` -> launch method, package spec / node script / custom
command, and the recognized server flags (`--shell`, repeated `--allowedDir`, `--commandTimeout`,
`--maxCommandLength`, `--safetyMode` equivalents, transport flags, `--config`, etc.); `cwd` and `env` ->
the launch cwd / env. Flags the form does not model are preserved verbatim in `extraArgs` so a save does
not silently drop them. After load, every tab reflects the file's values and the source bar shows the
file path and the `servers.wcli0` pointer.

### REQ-4: Save edits back to the same file

When the source is the `.vscode/mcp.json` file, Save writes the edited `servers.wcli0` entry back into
that file using the existing safe-merge rules (preserve other servers, refuse a non-object root /
`servers`, warn before discarding comments) rather than writing VS Code settings. Saving the file source
does not modify any `wcli0.*` setting. A dirty indicator reflects unsaved edits, and Revert reloads from
disk.

### REQ-5: The existing export path is preserved

"New config from current settings" stays available as an explicit switcher action and behaves exactly
like today's Export tab (`writeWorkspaceMcpJson` / `generateConfigFile`). Switching the source back to
VS Code Settings restores the scope radio and the settings save behavior unchanged.

### REQ-6: Global home config is read-only, never a silent save target

The server's implicit `~/.win-cli-mcp/config.json` is listed in the switcher as a read-only preview only.
It can never be selected as an editable/save source, so a save can never silently overwrite the user's
global config.

### REQ-7: Unsaved-changes guard on source switch

Switching the source (or loading a file) while the form has unsaved edits prompts for confirmation
before discarding them, mirroring the existing scope-switch guard (`scopeChangeRequest` in `webview.ts`).

### REQ-8: Documentation

`README.md` and any relevant `markdownDescription` text explain the source switcher, auto-detection, and
the `load -> edit -> save` round trip for `.vscode/mcp.json`.

## Non-Requirements

- Side-by-side / simultaneous settings + file editing (a future task; explicitly out of scope now).
- Editing arbitrary user-picked files via a Browse dialog (mockup 04) beyond the detected workspace
  `.vscode/mcp.json`; the "Open another file..." action may appear but its full browse behavior is
  deferred.
- Editing the richer wcli0 `--config` `config.json` format in place (mockup 05), including per-shell and
  profiles round-trip into a file source. When a detected entry references a `--config` file carrying
  per-shell/profiles, the form surfaces a note that those are not editable here rather than editing them.
- Any change to the MCP server definition provider's launch behavior or to the server's schema.
- Multi-root: only the primary workspace folder's `.vscode/mcp.json` is detected (matching
  `primaryWorkspaceFolder()` usage elsewhere).

## Acceptance Criteria

1. Opening the panel in a workspace whose `.vscode/mcp.json` has a `servers.wcli0` entry shows the
   detection banner; opening it without such a file (or with no workspace) shows no banner and the
   settings source is active.
2. Clicking "Load & edit" populates every form tab from the parsed entry, and the source bar shows the
   file path and `servers.wcli0` pointer.
3. A round trip `buildLaunchSpec(settings) -> parseMcpEntry -> settings` reproduces the modeled fields
   for representative stdio/http/sse settings; unmodeled flags survive in `extraArgs`.
4. With the file source active, Save writes the edited entry back to `.vscode/mcp.json`, preserves other
   `servers.*` entries, and leaves `wcli0.*` settings untouched.
5. A malformed or absent `.vscode/mcp.json` does not break detection or the panel; a malformed file is
   never overwritten on save (refused, matching today's writer).
6. `~/.win-cli-mcp/config.json` appears only as a read-only preview and cannot be chosen as a save target.
7. Switching source / loading a file with unsaved edits prompts before discarding.
8. The existing settings-scope editing and Export-tab behaviors are unchanged when the settings source is
   active.
9. `tsc --noEmit`, the unit suite, the integration suite, and markdownlint all pass.

## Deliverables

| Deliverable | Type |
| ----------- | ---- |
| vscode-extension/src/configSource.ts | Create |
| vscode-extension/src/argsBuilder.ts | Update |
| vscode-extension/src/commands.ts | Update |
| vscode-extension/src/webview.ts | Update |
| vscode-extension/src/extension.ts | Update |
| vscode-extension/test/unit/configSource.test.cjs | Create |
| vscode-extension/test/unit/commands.test.cjs | Update |
| vscode-extension/test/unit/webview.test.cjs | Update |
| vscode-extension/test/integration/mcpJson.test.js | Update |
| vscode-extension/README.md | Update |
