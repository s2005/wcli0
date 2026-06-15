# Analysis 73 - Materialize the managed config before showing its command

## Decision: Valid — fix applied

`showLaunchCommand` computed the managed-config pathname (per-shell or pinned) but never wrote the
file there, so a user who copied and ran the displayed `--config <path>` command before the provider
launched would hit a missing or stale file and the server would fall back to an implicit config.
`showLaunchCommand` now calls the provider's `writeManagedConfig(settings)` (made public), which writes
`buildConfigFile(settings)` to the provider's resolved private directory and returns the absolute path
actually used. The displayed command therefore references a file that exists and matches the shown
settings.

**Why:** The provider already encapsulates the correct write target (workspace storage, else a
per-window-unique temp dir) and the fallback logic, so reusing `writeManagedConfig` keeps the shown
path identical to what the provider registers and avoids duplicating the write. When the file cannot be
written (`undefined`), the per-shell branch already reports "no launch available" and the pin branch
falls back to the plain command, so no behavior regresses. The note wording was updated to drop the
now-inaccurate "on launch" qualifier and to cover both pin vectors (configured cwd and home config).
Verified by the updated `P26/P73` test in `commands.test.cjs` (asserts the managed config is written to
disk with the expected per-shell contents, not just that the path string appears).

**Commit:** dac74a5 — fix(vscode): address Codex round-10 review feedback for PR #86
