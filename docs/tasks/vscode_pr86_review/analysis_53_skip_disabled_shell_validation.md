# Analysis 53 - Skip validation for shells that are effectively disabled

## Decision: Valid — fix applied

The managed-mode loop in `validateLaunchSpec` now skips any shell that is not
effectively enabled, using a local `isShellEnabledForValidation` helper that mirrors
`configFile.isShellEnabled` (an explicit per-shell `enabled` wins, otherwise the legacy
`wcli0.shell` selector). The helper is duplicated rather than imported to avoid a
circular dependency between `argsBuilder` and `configFile`.

**Why:** A disabled shell is never spawned and `buildConfigFile` faithfully preserves
its disabled state, so its stale machine-specific paths, sub-range limits, or
unresolved executable variables cannot affect any execution. Blocking the entire MCP
provider over them prevented the enabled shells from registering at all. Verified by
`P53` tests in `argsBuilder.test.cjs` (explicit `enabled:false` and legacy-selector
disablement do not block; the selected shell is still validated).

**Commit:** 03524b0 — fix(vscode): address Codex round-7 review feedback for PR #86
