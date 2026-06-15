# Analysis 54 - Do not treat per-shell initialDir as an allowed path

## Decision: Valid — fix applied

The `hasPerShellPaths` check in `buildConfigFile` now counts only resolved per-shell
`allowedPaths`; a per-shell `initialDir` no longer keeps global
`restrictWorkingDirectory` enabled under `allowAllDirs`.

**Why:** The server never promotes a per-shell `initialDir` into that shell's
`allowedPaths`, so it cannot satisfy the working-directory restriction. Counting it
left the shell with `restrictWorkingDirectory: true` and an empty allowlist, so every
command failed with "No allowed paths configured" instead of honoring `allowAllDirs`.
Resolved per-shell `allowedPaths` still correctly block the lift. Verified by `P54`
tests in `configFile.test.cjs` (initialDir-only lifts the restriction; allowedPaths
keeps it).

**Commit:** 838acc4 — fix(vscode): address Codex round-7 review feedback for PR #86
