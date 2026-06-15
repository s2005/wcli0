# Analysis 82 - Ignore paths on shells with directory restriction disabled

## Decision: Valid — fix applied

The `hasPerShellPaths` decision in `buildConfigFile` now skips a shell whose
`overrides.security.restrictWorkingDirectory` is explicitly `false`, in addition to the existing
skip for disabled shells.

**Why:** a shell that disables its own working-directory restriction never enforces its allowlist, so
counting its paths as "configured" would keep the global `restrictWorkingDirectory` on with an empty
global allowlist — and every OTHER enabled shell inheriting the global restriction would reject
commands with "No allowed paths configured" instead of honoring `allowAllDirs`. Verified by an added
`P82` test in `configFile.test.cjs` (paths on a `restrictWorkingDirectory: false` shell no longer
block the lift; a shell that keeps the restriction still does).
