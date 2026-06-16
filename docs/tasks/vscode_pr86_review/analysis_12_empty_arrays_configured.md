# Analysis 12 - Treat explicit empty per-shell arrays as configured

## Decision: Valid - fix applied

`isMeaningfulShellConfig` classified per-shell configs whose only setting was an
explicit empty array (`blockedOperators: []`, `allowedPaths: []`, `executable.args: []`)
as meaningless, so the provider stayed on the CLI launch path and ignored the
override. Changed the `length`-based checks to `!== undefined` checks for the
restriction arrays, `allowedPaths`, and `executable.args`.

**Why:** Empty arrays are meaningful to the server - it uses them to clear
inherited blocked operators/commands/arguments or replace inherited allowed paths.
Misclassifying them could leave operators enabled or directories allowed contrary
to the configured restriction. Updated the existing detection test to assert the
new (correct) behavior.

**Commit:** 07629c2 - fix(vscode): address Codex round-2 review feedback for PR #86
