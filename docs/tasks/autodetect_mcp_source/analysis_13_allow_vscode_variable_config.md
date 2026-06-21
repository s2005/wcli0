# Analysis 13 - Allow VS Code input variables in loaded --config paths

## Decision: Valid — fix applied

For a file-source save, `writeMcpJsonFromSettings` now detects a VS Code launch-time
variable `--config` path (via `isVscodeVariableConfigPath`: an unresolved `${...}` that is
NOT an extension-owned `${workspaceFolder}`/`${userHome}` token) and validates with the
config path blanked, so the local unanchorable/loadability checks do not fire. The verbatim
argv (`--config ${input:cfg}`) is still emitted into the entry because `buildLaunchSpec`
keeps the unresolved token under `resolvePaths: false`.

**Why:** VS Code resolves `${input:...}`/`${command:...}`/`${env:...}` when it launches the
server, so the extension cannot (and must not) check those paths on disk; treating them as
blocking made an otherwise valid `.vscode/mcp.json` entry unsaveable after any unrelated
edit. Covered by a unit test asserting the save succeeds and the variable path round-trips.

**Commit:** 87784c3 — fix(vscode): address review feedback for PR #89 (round 2)
