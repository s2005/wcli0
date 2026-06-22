# Verification Plan: Auto-detect and load .vscode/mcp.json as an editable configuration source

## Purpose

Verify that the panel detects an existing `.vscode/mcp.json` with a `servers.wcli0` entry, loads it into
the form, and saves edits back to that file safely, while leaving the existing settings-driven editing and
one-way export unchanged.

## Pre-Implementation Verification

Run from `vscode-extension/`.

### Existing Tests Pass

```bash
npx tsc --noEmit -p ./
node --require ./test/stubs/hook.cjs --test test/unit/*.test.cjs
npx vscode-test
```

Expected: all pass (record the current unit + integration counts as the baseline).

### Coverage Baseline (Before)

| Module | Baseline Coverage | After Coverage | Delta |
| ------ | ----------------- | -------------- | ----- |
| configSource.ts | -- % | -- % | -- % |
| argsBuilder.ts | -- % | -- % | -- % |
| commands.ts | -- % | -- % | -- % |
| webview.ts | -- % | -- % | -- % |

## Post-Implementation Verification

### Per-Phase Verification

- Phase 1: `configSource.test.cjs` shows detection across present/absent/malformed/no-wcli0/no-workspace;
  `parseServerArgs` handles `=`-form, repeated flags and negations; `parseMcpEntry` covers npx/node/custom
  stdio plus http/sse URL parsing; the `buildLaunchSpec -> parseMcpEntry` round trip reproduces modeled
  fields with unknown flags in `extraArgs`.
- Phase 2: `webview.test.cjs` shows the source bar and banner render; a detected wcli0 source shows the
  banner; switching to the file source posts `loadSource`; saving posts `saveToFile`; the home config is
  rendered disabled.
- Phase 3: `commands.test.cjs` shows `writeMcpJsonFromSettings` preserves other servers, refuses a
  non-object root/`servers`, warns on comments, and never calls `config.update`; `webview.test.cjs` shows
  `ready` posts detected sources, `loadSource` populates the form, `saveToFile` writes via the file
  writer, the home config is rejected as a save target, and an external settings change does not clobber a
  file source.
- Phase 4: `mcpJson.test.js` shows detection and a save-back round trip preserving a second server.

### Linter

```bash
npx tsc --noEmit -p ./
npx markdownlint-cli2 "docs/tasks/autodetect_mcp_source/*.md"
```

Expected: 0 errors.

### Regression Check

```bash
node --require ./test/stubs/hook.cjs --test test/unit/*.test.cjs
npx vscode-test
```

Expected: all previously-passing tests still pass; new tests pass.

## Final Acceptance Verification

The feature can be accepted when all items are true:

- [ ] Opening the panel with a `servers.wcli0` entry in `.vscode/mcp.json` shows the detection banner;
  without it (or with no workspace) no banner shows and the settings source is active.
- [ ] "Load & edit" populates every tab from the parsed entry and the source bar shows the file path and
  `servers.wcli0` pointer.
- [ ] `buildLaunchSpec(settings) -> parseMcpEntry -> settings` reproduces modeled fields; unmodeled flags
  survive in `extraArgs`.
- [ ] With the file source active, Save writes the edited entry back, preserves other `servers.*`, and
  leaves `wcli0.*` settings untouched.
- [ ] A malformed or absent `.vscode/mcp.json` does not break detection/the panel and is never overwritten.
- [ ] `~/.win-cli-mcp/config.json` appears only as a read-only preview and cannot be a save target.
- [ ] Switching source / loading a file with unsaved edits prompts before discarding.
- [ ] Settings-scope editing and Export-tab behavior are unchanged with the settings source active.
- [ ] Unit and integration suites pass; markdownlint passes; `tsc --noEmit` clean.
