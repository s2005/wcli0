# Progress: Auto-detect and load .vscode/mcp.json as an editable configuration source

## Status Legend

| Marker | Meaning |
| ------ | ------- |
| `[ ]` | Not started |
| `[x]` | Complete |
| `[~]` | In progress |
| `[!]` | Blocked or needs decision |
| `[-]` | Skipped / not applicable |

## Planning Checklist

- [x] Analyze current behavior.
- [x] Create analysis.md
- [x] Create PRD.md
- [x] Create implementation_plan.md
- [x] Create verification.md
- [x] Create progress.md

## Phase 1: Source model and reverse parser

- [x] Create `src/configSource.ts` with source kinds and `ConfigSource` descriptor.
- [x] Implement `detectWorkspaceMcpJson(folder)` (JSONC-tolerant, never throws).
- [x] Implement `parseServerArgs(args)` inverse of `buildServerArgs` (=-form, repeated, negations).
- [x] Implement `parseMcpEntry(entry)` (transport, launch method, cwd/env, notes).
- [x] Create `test/unit/configSource.test.cjs` (detection, parser, round-trip).
- [x] `tsc --noEmit` clean; phase tests pass (22 new tests).

## Phase 2: Webview source bar and messaging

- [x] Render the source bar (active-source chip, switcher, detection banner) in `renderHtml`.
- [x] Nest the scope radio under the settings source; file source shows Save to file / Revert / dirty.
- [x] Webview script: render `init.source` / `init.detected`, build switcher menu, post messages.
- [x] Unsaved-changes guard on source switch (reuse `scopeChangeRequest` pattern).
- [x] Update `test/unit/webview.test.cjs` for source bar / banner / messages.
- [x] `tsc --noEmit` clean; phase tests pass.

## Phase 3: Host load and save wiring

- [x] Extract `writeMcpJsonFromSettings(settings, folder, ...)` from `writeWorkspaceMcpJson`.
- [x] `setupWebview`: add `currentSource`; detect on `ready`; include `source`/`detected` in `init`.
- [x] Handle source switch (read + `parseMcpEntry` + populated `init` + notes).
- [x] Handle `saveToFile` (overlay form values onto loaded baseline -> file writer; no `config.update`).
- [x] Reject home/read-only source as a load or save target.
- [x] Keep external re-post synchronous; refresh detection cache without racing a save (P96).
- [x] Update `test/unit/commands.test.cjs` and `test/unit/webview.test.cjs`.
- [x] `tsc --noEmit` clean; full unit suite passes (431).

## Phase 4: Integration and documentation

- [x] Integration test merges the wcli0 entry into an existing file and preserves other servers
  (the shared `writeMcpJsonFromSettings` save path the file source also uses).
- [x] Update `test/integration/mcpJson.test.js`; full integration suite passes (16).
- [x] Update `README.md` (source switcher, auto-detect, round trip, home read-only, side-by-side future).
- [x] `vscode-test` passes; markdownlint clean.

## Notes

- The webview is the only surface for load/save (no command), so detection/load/save are covered by
  unit tests against the host message handlers; the integration test covers the shared file-write
  merge path in a real Extension Host.
- Deferred (non-requirements, per the PRD): arbitrary file browse, in-place `config.json` editing,
  and the side-by-side settings/file view.

## Review Feedback

(Section appears when PR review feedback arrives. Each comment gets a checkbox.)

### Review Feedback (PR #89)

- [x] P1: Prevent export actions from persisting file-source edits (fixed — host
  export handler refuses while `currentSource === 'mcpJson'`; webview disables the
  export buttons in file mode)
- [x] P2: Reset file source when the primary folder changes (fixed — track
  `loadedFileFolder` and reset the file source whenever the primary folder's fsPath
  no longer matches it)
- [x] P3: Preserve dash-prefixed custom launcher args (fixed — split custom args at
  the first recognized wcli0 flag via `isServerFlag`, not the first dash)
- [x] P4: Clear omitted env from the saved file baseline (fixed — re-baseline
  `saveToFile` from the entry re-read off disk after writing)
- [x] P5: Preserve full HTTP/SSE URLs when round-tripping (fixed — preserve the
  verbatim `transportUrl` and write it back unless host/port were edited; note
  non-canonical URLs)

### Review Feedback (PR #89, round 2)

- [x] P6: Reject stale file-source saves after workspace changes (fixed — `saveToFile`
  proceeds only while still in `mcpJson` mode for the same `loadedFileFolder` with the
  loaded entry intact)
- [x] P7: Preserve HTTP/SSE auth fields when saving (fixed — merge the regenerated
  fields onto the loaded raw entry via `mergeEntryOntoBase`, keeping `headers`/`oauth`)
- [x] P8: Avoid loading default-port URLs as invalid port 0 (fixed — keep the valid
  default port, preserve the verbatim URL, and note the port field is inert for it)
- [x] P9: Preserve non-string env values on file saves (fixed — round-trip the loaded
  entry's raw `env` verbatim instead of the string-filtered settings env)
- [x] P10: Preserve socket and pipe URLs (fixed — retain the verbatim `transportUrl`
  when it cannot be decomposed; `preservedFileUrl` writes it back unchanged)
- [x] P11: Clear stale file-source notes after clean reloads (fixed — carry notes in
  every file-source `init` and clear them when empty)
- [x] P12: Preserve stdio-only VS Code fields (fixed — `mergeEntryOntoBase` keeps
  `envFile`/`dev`/`sandboxEnabled` and removes the opposite mode's keys)
- [x] P13: Allow VS Code input variables in loaded --config paths (fixed — validate
  file-source saves with a VS Code-variable `--config` path blanked; emit it verbatim)

### Review Feedback (PR #89, round 3)

- [x] P14: Preserve node runtime arguments (fixed — gate the node fast path on a
  non-option first arg; node-with-options parses as custom)
- [x] P15: Avoid stealing wrapper options that look like server flags (fixed — split
  custom args at the start of the longest pure server-flag suffix)
- [x] P16: Re-post source detection after workspace changes (fixed — push a dedicated
  `detected` message after the async detection refresh)
- [x] P17: Preserve npx launcher options (fixed — gate the npx fast path on a
  non-option package token; npx-with-options parses as custom)
- [x] P18: Allow VS Code variables in all file-source launch fields (fixed —
  `neutralizeVscodeVariableLaunchFields` bypasses validation for every preserved field)
- [x] P19: Drop stale transport-only fields on mode changes (fixed — remove the other
  transport's full field set, including `headers`/`oauth` and `envFile`/`dev`)
- [x] P20: Merge against the current on-disk entry before saving (fixed — re-derive the
  merge base from the re-read entry so external additions survive)
- [x] P21: Parse URL userinfo before host/port (fixed — `parseHttpUrl` skips an optional
  `userinfo@` segment)
