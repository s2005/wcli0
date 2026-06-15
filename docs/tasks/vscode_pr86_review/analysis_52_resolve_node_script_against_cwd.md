# Analysis 52 - Resolve relative Node scripts against the configured cwd

## Decision: Valid — fix applied

`buildLaunchSpec`'s node branch now uses a dedicated `nodeScriptArg` helper: when
`wcli0.launch.cwd` is set and the script is relative it is resolved against that cwd
(for mcp.json it is left relative for VS Code/node to resolve under the cwd); without a
cwd it falls back to the workspace-anchored value. `isUnanchorableNodeScript` makes
validation treat a relative script as anchorable when a resolvable cwd is present, even
with no workspace open.

**Why:** The provider launches node with `cwd` as its process directory, so node
resolves a relative script against that cwd at runtime. Anchoring `dist/index.js` to
the workspace root when cwd is `/repo/server` launched `/repo/dist/index.js` instead of
`/repo/server/dist/index.js` — a different (or missing) file. The previous validation
also wrongly blocked a relative script that an absolute cwd could anchor when no
workspace was open. Verified by `P52` tests in `argsBuilder.test.cjs` (cwd resolution,
no-workspace anchorability, mcp.json relative preservation).

**Commit:** 838acc4 — fix(vscode): address Codex round-7 review feedback for PR #86
