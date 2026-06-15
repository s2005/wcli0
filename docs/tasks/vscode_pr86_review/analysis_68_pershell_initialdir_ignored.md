# Analysis 68 - Do not expose a per-shell initial directory that is ignored

## Decision: Valid — fix applied (setting removed)

The per-shell `overrides.paths.initialDir` surface is removed because the server never consumes it:
`initializeWorkingDirectory` chdir's only to `config.global.paths.initialDir`, and per-shell
`resolved.paths.initialDir` appears solely in the get_config summary, never in command execution or
path validation. Removed from the package.json schema, the `PerShellConfig` type, the webview UI
field (`sh-<name>-initdir`) and its collect/set JS, the config emission in `applyPerShellOverrides`,
the `isMeaningfulShellConfig` check, and the managed validation in `validateLaunchSpec`. The global
`wcli0.initialDir` (which the server does honor) is unchanged.

**Why:** Promotion is not feasible — the server performs a single global startup chdir, so a
per-shell initial directory cannot be honored per shell. Presenting a control that silently does
nothing is misleading, so the honest fix is to stop accepting and exporting it. Per-shell
`allowedPaths` (which the server does enforce) remain. Verified by updated tests in
`configFile.test.cjs` / `settings.test.cjs` / `webviewShells.test.cjs` (no per-shell `initialDir`
is emitted or surfaced).

**Commit:** 4c5a136 — fix(vscode): address Codex round-9 review feedback for PR #86
