# Analysis 22 - Count per-shell paths before honoring allowAllDirs

## Decision: Valid - fix applied

`buildConfigFile` computed `hasConfiguredPaths` from global paths only, so with
`allowAllDirs` enabled and no global paths it set global
`restrictWorkingDirectory: false` even when a per-shell `overrides.paths` supplied
an allowlist. A shell without its own `restrictWorkingDirectory` override inherits
that global `false`, so its allowed paths are present in the config but never
enforced. Added a `hasPerShellPaths` check (resolved per-shell `allowedPaths` /
`initialDir` across `SHELL_NAMES`) and folded it into `hasConfiguredPaths`.

**Why:** A configured allowlist that is silently unenforced is a security gap
(P1). The fix uses resolved paths so unresolved/dropped entries don't spuriously
keep the restriction on.

**Commit:** cf7e17e - fix(vscode): address Codex round-3 review feedback for PR #86
