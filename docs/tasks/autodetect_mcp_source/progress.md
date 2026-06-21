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

- [ ] Create `src/configSource.ts` with source kinds and `ConfigSource` descriptor.
- [ ] Implement `detectWorkspaceMcpJson(folder)` (JSONC-tolerant, never throws).
- [ ] Implement `parseServerArgs(args)` inverse of `buildServerArgs` (=-form, repeated, negations).
- [ ] Implement `parseMcpEntry(entry)` (transport, launch method, cwd/env, notes).
- [ ] Create `test/unit/configSource.test.cjs` (detection, parser, round-trip).
- [ ] `tsc --noEmit` clean; phase tests pass.

## Phase 2: Webview source bar and messaging

- [ ] Render the source bar (active-source chip, switcher, detection banner) in `renderHtml`.
- [ ] Nest the scope radio under the settings source; file source shows Save to file / Revert / dirty.
- [ ] Webview script: render `init.source` / `init.detected`, build switcher menu, post messages.
- [ ] Unsaved-changes guard on source switch (reuse `scopeChangeRequest` pattern).
- [ ] Update `test/unit/webview.test.cjs` for source bar / banner / messages.
- [ ] `tsc --noEmit` clean; phase tests pass.

## Phase 3: Host load and save wiring

- [ ] Extract `writeMcpJsonFromSettings(settings, folder, ...)` from `writeWorkspaceMcpJson`.
- [ ] `setupWebview`: add `currentSource`; detect on `ready`; include `source`/`detected` in `init`.
- [ ] Handle `loadSource` (read + `parseMcpEntry` + populated `init` + notes).
- [ ] Handle `saveToFile` (collect form values -> settings -> file writer; no `config.update`).
- [ ] Reject home/read-only source as a load or save target.
- [ ] Gate external `post(true)` so it does not clobber an active file source.
- [ ] Update `test/unit/commands.test.cjs` and `test/unit/webview.test.cjs`.
- [ ] `tsc --noEmit` clean; full unit suite passes.

## Phase 4: Integration and documentation

- [ ] Add a fixture `.vscode/mcp.json` with `servers.wcli0` + a second server.
- [ ] Update `test/integration/mcpJson.test.js` for detection + save-back round trip.
- [ ] Update `README.md` (source switcher, auto-detect, round trip, home read-only, side-by-side future).
- [ ] `vscode-test` passes; markdownlint clean.

## Review Feedback

(Section appears when PR review feedback arrives. Each comment gets a checkbox.)
