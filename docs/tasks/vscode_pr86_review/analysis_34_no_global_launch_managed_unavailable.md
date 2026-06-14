# Analysis 34 - Do not show a global launch when managed storage is unavailable

## Decision: Valid — fix applied

`showLaunchCommand` only built a managed-config launch when a target directory was available;
otherwise it fell through to `buildLaunchSpec` with no `managedConfigPath`, displaying a global-flag
command that ignores every per-shell setting and a note claiming a config was "written to undefined".
The provider registers no server in that same scenario. Now, when per-shell mode is active but no
managed-config directory can be resolved, the command reports that no launch is available (mirroring
the provider) instead of rendering a mismatched global command.

**Why:** The displayed command must reflect what the provider would actually register. A global-flag
command in per-shell mode is misleading and could lead a user to run a server with none of their
per-shell settings applied.

**Commit:** 174b9ce — fix(vscode): address Codex round-4 review feedback for PR #86
