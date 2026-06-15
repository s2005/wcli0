# Analysis 37 - Preserve inheritance when users clear per-shell lists

## Decision: Valid — fix applied

The `arr()` helper in `collectShells()` returned `[]` whenever a list textarea was empty and the loaded
value was an array — including the case where the user just cleared a previously non-empty list. Because
the server's `mergeRestrictions` replaces `blockedOperators` (and `mergePaths` replaces `allowedPaths`)
rather than appending, that `[]` silently wiped the safe global state. Tightened `arr()` so an empty
textarea preserves `[]` only when the loaded value was already `[]`; a cleared non-empty list is treated
as "remove the override" (`undefined`) so the shell re-inherits the global value.

**Why:** Round-3 (P20) made an explicit `[]` meaningful server-side and the editor needed to round-trip
it, but the original implementation conflated "loaded `[]`" with "loaded non-empty array the user just
cleared". The two cases have different user intent: the first is an explicit empty override, the second
is a request to remove the override. The new logic distinguishes them without requiring extra UI
controls, matching the reviewer's first suggestion (distinguish unchanged-originally-empty from cleared-
non-empty). Arrays that use append-merge (`blockedCommands`/`blockedArguments`) are unaffected because
the loaded-vs-cleared distinction now resolves to "remove override", which is also the safer behavior.

**Commit:** b56a677 — fix(vscode): address Codex round-5 review feedback for PR #86
