# Analysis 49 - Show the provider's fallback cwd with the launch command

## Decision: Valid - fix applied

`showLaunchCommand` printed a `cwd:` line only when `spec.cwd` was set, so with no
`launch.cwd` configured it showed nothing - yet the provider launches from a
private extension-owned directory (`privateDir()`), not the caller's cwd. Copying
the command and running it elsewhere would let wcli0 auto-load a different
`config.json`. Added a public `resolveLaunchCwd(configuredCwd)` on the provider
that mirrors the launch logic (`configuredCwd ?? this.privateDir()`), and updated
`showLaunchCommand` to display that resolved cwd; when no `launch.cwd` is set it
adds a note that the directory is the provider's private launch dir (chosen to
avoid auto-loading a workspace/temp config.json).

**Why:** The displayed command should match what the provider actually registers,
the same principle behind round-5 P26 (showing the resolved managed-config dir).
Reusing the provider's own `privateDir()` via a thin accessor guarantees the shown
cwd equals the launch cwd, and the explanatory note prevents a user from assuming
a copied command runs in their current directory.

**Commit:** 11d813f - fix(vscode): address Codex round-6 review feedback for PR #86
