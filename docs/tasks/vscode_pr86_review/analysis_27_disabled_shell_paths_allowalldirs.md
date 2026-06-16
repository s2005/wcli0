# Analysis 27 - Exclude disabled-shell paths from the allowAllDirs check

## Decision: Valid — fix applied

`buildConfigFile` computed `hasPerShellPaths` over every shell's `overrides.paths` regardless of the
shell's effective `enabled` state. A disabled shell carrying an allowlist therefore kept the global
`restrictWorkingDirectory` on under `allowAllDirs`, leaving enabled shells with an empty global
allowlist that fails at runtime. Added an `isShellEnabled` helper (mirrors the same effective-enabled
computation used when emitting each shell: per-shell `enabled` wins, else the `wcli0.shell` selector)
and gated the per-shell path count on it.

**Why:** A shell only inherits the global `restrictWorkingDirectory` when it is actually launched.
Paths belonging to a disabled shell cannot constrain anything, so they must not suppress the
`allowAllDirs` lift — exactly the server's "when no allowed paths are configured" semantics.

**Commit:** 174b9ce — fix(vscode): address Codex round-4 review feedback for PR #86
