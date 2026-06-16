# Analysis 1 - Resolve relative paths in generated MCP entries

## Decision: Valid - fix applied

`pathValue` with `resolvePaths: false` returned bare relative values verbatim, so
a setting like `allowedDirectories: ["src"]` emitted `--allowedDir src` into a
committed `.vscode/mcp.json`. Confirmed in `src/utils/validation.ts`
`normalizeWindowsPath` that a truly relative path is C-rooted via
`path.win32.resolve('C:\\', tempPath)` (e.g. `src` -> `C:\src`), not anchored to
the workspace. The resolved-path branch (`resolvedPath`) and the config-file
generator both anchor relative paths to the primary workspace folder, so the
mcp.json path diverged and could deny the intended directory while allowing an
unrelated one. Fixed by converting a plain relative path (no token, not absolute)
to a `${workspaceFolder}/...` token in the `resolvePaths === false` branch so VS
Code resolves it against the workspace; tokenized and absolute values are kept
verbatim.

**Why:** The committed mcp.json must behave like the auto-registered provider and
the config-file generator. `${workspaceFolder}` is the portable, VS Code-resolved
form that keeps the path workspace-relative across machines, matching the existing
convention used elsewhere in `commands.ts` (`toPortablePath`).

**Commit:** 6017df8 - fix(vscode): address Codex review feedback for PR #86
