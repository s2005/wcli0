# Analysis 69 - Preserve unset state in the scoped configuration form

## Decision: Valid — fix applied

The select/optional-string masking cases were already handled (P41/P45/P60). The remaining gap named
by Codex is the one array field the form edits, `allowedDirectories`: an explicit empty override
could not be distinguished from "unset" (both render an empty textarea) and so could not mask a
non-empty User value. A new `OPTIONAL_ARRAY_KEYS` (+ `explicitlySetArrayKeys`) reports whether the
key is set at the scope; the webview posts `setArrayKeys` and gives `allowedDirectories` an Inherit
checkbox mirroring the optional-string pattern (checked → `null`, cleared by `applySettings`;
unchecked + empty → an explicit `[]` override that masks the other scope).

**Why:** VS Code merges an explicit workspace `[]` over a non-empty user array, so it is a
meaningful override the form previously could not express. `allowedDirectories` is the only array
field in the form (blocked lists, custom args, env, origins are not form-editable), so this closes
the named gap. `applySettings` already persists `[]` as-is and maps `null` to undefined, so no
save-path change was needed. Verified by added `P69` tests in `settings.test.cjs` (set/unset array
reporting) and `webview.test.cjs` (init carries `setArrayKeys`; empty override round-trips).

**Commit:** 4c5a136 — fix(vscode): address Codex round-9 review feedback for PR #86
