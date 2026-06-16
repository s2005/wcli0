# Analysis 58 - Preserve portability for dot-dot-prefixed workspace children

## Decision: Valid — fix applied

`toPortablePath` in `commands.ts` now classifies a target as outside the workspace only
on an actual parent-traversal component — `rel === '..'`, `rel.startsWith('..' + sep)`,
or `rel.startsWith('../')` — instead of a bare `rel.startsWith('..')`.

**Why:** `rel.startsWith('..')` also matched ordinary in-workspace directory names such
as `..generated`, so a valid in-workspace location like
`/workspace/..generated/wcli0.json` was wrongly stored as an absolute,
machine-specific `wcli0.configFile` path, breaking the committed workspace setting on
teammates' machines. The traversal-component check keeps a real escape (`../up`) on the
absolute path while restoring the portable `${workspaceFolder}` token for legitimate
children. Verified by `P58` test in `commands.test.cjs`.

**Commit:** 03524b0 — fix(vscode): address Codex round-7 review feedback for PR #86
