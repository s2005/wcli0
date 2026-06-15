# Analysis 48 - Preserve explicit empty workspace string overrides

## Decision: Valid - fix applied

`applySettings` mapped every empty value to undefined (clear), so the form could
never persist an explicit empty workspace override for the optional string
settings `launch.cwd`, `configFile`, `initialDir`, and `logDirectory`, where an
empty value meaningfully masks a non-empty User default. Introduced
`OPTIONAL_STRING_KEYS` in settings.ts plus `explicitlySetKeys(scope)` (which keys
are actually set at the scope, via `inspect`). The form now renders an Inherit
checkbox next to each of these fields; `post` sends `setKeys` so the checkbox
initializes correctly. In the form, a non-empty value is always an explicit
override; when the field is empty the checkbox decides - checked emits `null`
(applySettings clears), unchecked emits `''` (persisted). `applySettings` now
clears these keys only on `null`, persisting `''` as-is, while every other field
keeps the `'' -> clear` behavior.

**Why:** Distinguishing "no override" from "explicit empty override" is exactly
what the reviewer asked for and what the effective-config merge needs (a workspace
`''` correctly suppresses a User value at provider launch). The checkbox plus a
`setKeys` signal is the smallest correct mechanism; field-value-priority keeps the
common "type a value" case friction-free and preserves the existing "typing is an
edit" behavior the form's dirty-tracking relies on. Two existing host-side tests
that sent `configFile: ''` to mean "clear" were updated to use a non-optional key,
matching the new contract (null clears, '' persists).

**Commit:** 52c2bb8 - fix(vscode): address Codex round-6 review feedback for PR #86
