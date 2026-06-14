# Analysis 16 - Reject unresolved log directories instead of dropping them

## Decision: Valid - fix applied

`buildServerArgs` silently omitted `--logDirectory` when the value didn't resolve
(unresolved token or unanchorable relative), and `validateLaunchSpec` had no
corresponding check, so the server registered and kept logs only in memory
instead of the configured persistent location. Added a blocking
`isUnanchorablePath(s.logDirectory)` check to `validateLaunchSpec`, matching the
other path-like settings.

**Why:** A silently dropped log directory misleads the user into thinking
persistent logging is active; consistency with the cwd/initialDir/allowedDirectories
checks.

**Commit:** 07629c2 - fix(vscode): address Codex round-2 review feedback for PR #86
