# Analysis 31 - Isolate fallback managed configs between workspace windows

## Decision: Valid — fix applied

When workspace storage was unavailable, `writeManagedConfig`/`managedConfigTargetDir` fell back to
`privateDir()`, which returns the shared global `safeCwd`. Every window then wrote the fixed
`managed-config.json` into the same global directory and could clobber another window's config.
Split the unique-temp-dir creation out of `privateDir` into `uniqueTempDir`, and made the managed
config target use `managedConfigDir ?? uniqueTempDir()` — never the shared `safeCwd`. `privateDir`
(the server cwd fallback) still prefers `safeCwd`, which is safe to share as a neutral cwd.

**Why:** The managed config is written to a fixed filename, so its directory must be unique per
window/workspace; a per-window `mkdtemp` directory guarantees isolation while preserving the existing
behavior when workspace storage is available.

**Commit:** 174b9ce — fix(vscode): address Codex round-4 review feedback for PR #86
