# Analysis 45 - Add an Inherit option for logging tri-state settings

## Decision: Valid - fix applied

`enableTruncation` and `enableLogResources` are `TriState` enums whose `default`
value is a real server setting ("let the server decide"), not "inherit"; their
selects offered only `default`/`enabled`/`disabled`, so the form could never clear
a workspace override - choosing `default` persisted the literal string and kept a
non-default User value masked. Added a leading `<option value="">Inherit</option>`
to both selects, matching the other enum controls (round-5 P41). These fields are
already in the form's `stringFields`, whose collect path emits `''` for the empty
option, and `applySettings` maps `''` to undefined, clearing the scope override.

**Why:** The boolean tri-selects (`allowAllDirs`, `debug`) treat `default` as
inherit because `triToBool('default')` is undefined; but for these string enums
`default` is a persistable value, so a distinct Inherit entry is required to undo
an override - the same gap round-5 P41 closed for the other enums. `''` is never
persisted (it maps to undefined), so the package.json enum needs no new member.

**Commit:** 52c2bb8 - fix(vscode): address Codex round-6 review feedback for PR #86
