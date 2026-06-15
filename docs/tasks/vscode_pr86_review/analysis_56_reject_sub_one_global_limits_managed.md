# Analysis 56 - Reject sub-one global limits in managed mode

## Decision: Valid — fix applied

`validateLaunchSpec` now applies a mode-dependent bound to global `commandTimeout` and
`maxCommandLength`: in managed (per-shell) mode they must be `>= 1` (a finite number),
matching the config-file rule; in non-managed mode the existing `> 0` rule still
applies because they are passed as post-load CLI overrides.

**Why:** In managed mode these limits are written into the generated config, where the
server's `validateConfig` rejects values between 0 and 1 — and `buildConfigFile`
silently drops them (its `posNum` requires `>= 1`). So a value such as
`commandTimeout: 0.5` launched with the server default instead of the configured value,
with no warning. The previous validation only caught non-positive values. Verified by
`P56` test in `argsBuilder.test.cjs` (0.5 blocks in managed mode, is accepted as a CLI
flag, and 0 blocks in both modes).

**Commit:** 838acc4 — fix(vscode): address Codex round-7 review feedback for PR #86
