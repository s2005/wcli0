# Analysis 18 - Allow VS Code variables in all file-source launch fields

## Decision: Valid — fix applied

The file-source validation bypass is generalized from `configFile` to all launch fields via
`neutralizeVscodeVariableLaunchFields`: optional path fields holding a VS Code launch-time
variable (`configFile`, `cwd`, `initialDir`, `logDirectory`, variable `allowedDirectories`)
are blanked for validation, and the required fields (`nodeScriptPath`, `customCommand`) are
replaced with an absolute placeholder. The real values are still emitted verbatim because
`buildLaunchSpec(..., { resolvePaths: false })` keeps the tokens.

**Why:** VS Code resolves `${input:...}`/`${env:...}`/`${command:...}` at launch, so the
extension's local anchorability checks must not reject an otherwise no-op file-source Save
that uses them in any preserved field. Covered by unit tests for a variable `cwd` and a
variable node script path.

**Commit:** 3eccda7 — fix(vscode): address review feedback for PR #89 (round 3)
