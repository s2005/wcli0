# Analysis 30 - Resolve relative node script paths before launch

## Decision: Valid — fix applied

A relative `launch.nodeScriptPath` (e.g. `dist/index.js`) passed validation and was handed to Node
unchanged, but the provider launches from a private extension directory when `launch.cwd` is unset, so
Node resolved it under that directory instead of the workspace. `buildLaunchSpec`'s node case now runs
the script path through `pathValue` (anchors a relative path to `${workspaceFolder}`, or keeps the
portable token when emitting mcp.json), and `validateLaunchSpec` now flags a node script path that
cannot be anchored (unresolved variable, or relative with no workspace open).

**Why:** The node script path is as path-like as `cwd`/`initialDir`/`allowedDirectories`, which are
already anchored to the workspace; treating it the same way removes the silent dependence on the
server's process cwd and refuses misconfigurations rather than launching a server that never starts.

**Commit:** 174b9ce — fix(vscode): address Codex round-4 review feedback for PR #86
