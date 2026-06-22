# Analysis 23 - Preserve current on-disk env on file saves

## Decision: Valid — fix applied

`writeMcpJsonFromSettings` sourced the round-tripped `env` from the panel-open snapshot
(`baseEntry`). Since `env` is a form-owned stdio key, the current-on-disk merge (P20)
deleted the on-disk `env` and reapplied the stale one, so a variable another process
added after the panel opened was silently dropped — and no env prompt appeared because
the stale baseline looked empty/unchanged. The fix reads the CURRENT on-disk entry via
`readWcli0Entry(folder)` and round-trips its raw `env` (falling back to `baseEntry` when
nothing is on disk, mirroring the P20 merge-base re-derivation).

**Why:** `env` is unmodeled by the form, so the file is the source of truth for it; the
save must preserve whatever is on disk rather than a snapshot. Aligns with the existing
P20 (merge against current on-disk entry) and P9 (preserve non-string env) handling.
Covered by webview.test.cjs P23 (a PORT added on disk after load survives an unrelated
save).

**Commit:** baf060b — fix(vscode): address review feedback for PR #89 (round 4)
