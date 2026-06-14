# Analysis 3 - Reject unresolved variables in custom launcher arguments

## Decision: Valid - fix applied

`buildLaunchSpec` resolves each `customArgs` entry with `resolveVariables`, which
leaves unknown tokens literal when no workspace folder is open. `validateLaunchSpec`
validated `customCommand` (and `cwd`, `initialDir`, `allowedDirectories`,
`configFile`) for unresolved tokens but not `customArgs`, so an arg such as
`${workspaceFolder}/server.js` would be registered and passed literally, failing
every launch silently. Fixed by iterating `s.customArgs` in the custom-method
branch and adding a blocking problem for any entry that `isUnresolvable` reports.

**Why:** Consistency with the existing token-validation policy for every other
path-like launch input - refuse to register a definition that is guaranteed to
fail or behave unexpectedly, rather than register a broken server.

**Commit:** 6017df8 - fix(vscode): address Codex review feedback for PR #86
