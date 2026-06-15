# Analysis 50 - Convert workspace paths for WSL shell overrides

## Decision: Valid — fix applied

`applyPerShellOverrides` in `configFile.ts` now converts resolved Windows drive paths
in a WSL shell's `overrides.paths.allowedPaths` and `initialDir` to their `/mnt/<drive>`
mount form (using the effective per-shell mount point) before writing the override. A
new `convertWindowsToWslPath` helper mirrors the server's conversion; already-Unix and
UNC paths pass through unchanged, and non-WSL shells keep Windows paths verbatim.

**Why:** The server's `resolveWslAllowedPaths` adds per-shell `allowedPaths` to the
WSL allowlist *verbatim* and only converts GLOBAL paths (`src/utils/validation.ts`).
`validateWslPath` then compares the working directory (already normalized to
`/mnt/c/...`) against those entries, so a Windows path such as `C:\repo` never matches
and every WSL execution is rejected with "must be within allowed paths". Writing the
path in mount form is what the validator actually compares against. Verified by
`P50` tests in `configFile.test.cjs` (conversion, custom mount point, non-WSL
untouched).

**Commit:** 838acc4 — fix(vscode): address Codex round-7 review feedback for PR #86
