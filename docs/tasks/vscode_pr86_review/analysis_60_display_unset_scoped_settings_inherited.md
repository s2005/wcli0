# Analysis 60 - Display unset scoped settings as inherited

## Decision: Valid — fix applied

`readSettingsForScope` returns the schema default for a value unset at the scope, which
the form could not tell apart from an explicit default-valued override — so an unset
Workspace `safetyMode` rendered as `safe` even when the effective User override was
`unsafe`. A new `explicitlySetSelectKeys` (mirroring `explicitlySetKeys` for optional
strings) reports which inheritable enum/boolean fields are actually set at the scope.
The webview now posts `setSelectKeys`; `setVal` forces each unset select to its Inherit
state (`''` for enum selects, `default` for the `allowAllDirs`/`debug` tri-bools) so an
unset field shows Inherit instead of a misleading default value.

**Why:** the Inherit options added in P41/P45 are only meaningful if the form knows the
field's set/unset state; without it, an unset enum/boolean read back as the schema
default and was displayed as an explicit override equal to that default. Communicating
the set/unset state keeps the displayed safety state accurate (Inherit, not a spurious
`safe`). Verified by `P60` tests in `settings.test.cjs` (set/unset reporting) and
`webview.test.cjs` (init carries `setSelectKeys`).

**Commit:** 34888ec — fix(vscode): address Codex round-8 review feedback for PR #86
