# Analysis 7 - Preserve fractional maxOutputLines in generated configs

## Decision: Valid - fix applied

The round-1 fix accepted fractional `maxOutputLines` in `validateLaunchSpec` and
the CLI-arg path, but `buildConfigFile` still gated it on the integer-only
`posInt`, so a value like `1.5` was dropped from the generated config and from
the per-shell managed config (the only place the value can be carried in managed
mode). Added a `maxOutputLinesValue` helper (finite, `>= 1`, `<= 10000`, fractional
allowed) and used it for `maxOutputLines`; `maxReturnLines` keeps `posInt`
because the server's `validateLoggingConfig` requires an integer there.

**Why:** The generated config must mirror the server's per-field constraints, and
must stay consistent with the round-1 CLI-arg fix; otherwise managed-mode launches
silently use the server default instead of the configured value.

**Commit:** 07629c2 - fix(vscode): address Codex round-2 review feedback for PR #86
