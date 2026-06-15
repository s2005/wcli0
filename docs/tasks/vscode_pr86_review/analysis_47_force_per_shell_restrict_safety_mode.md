# Analysis 47 - Force per-shell directory restrictions to match safety mode

## Decision: Valid - fix applied

In `buildConfigFile`, the yolo/unsafe cleanup forced per-shell injection
protection off and cleared blocked lists but left a per-shell
`overrides.security.restrictWorkingDirectory` untouched. The server resolves a
per-shell override OVER the global value, so a shell pinned to `false` defeated
yolo's documented `restrictWorkingDirectory: true`, and a shell pinned to `true`
survived unsafe's global `false`. Extended the cleanup block: when an override's
`restrictWorkingDirectory` is defined, force it to `true` for yolo and `false` for
unsafe (`s.safetyMode === 'yolo'`). A shell with no such override is left to
inherit the global value.

**Why:** The generated managed config is launched with `--config` and no `--yolo`
flag, so the file must already express the mode's intent. The server's own
`applyCliUnsafeMode` does not normalize per-shell `restrictWorkingDirectory`, so
emitting a contradicting per-shell value would silently widen access - exactly the
P1 security gap. Only forcing an already-present override (not injecting one)
keeps inheritance intact for shells the user did not pin.

**Commit:** 11d813f - fix(vscode): address Codex round-6 review feedback for PR #86
