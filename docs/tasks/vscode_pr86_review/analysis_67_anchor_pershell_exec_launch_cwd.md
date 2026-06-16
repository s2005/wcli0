# Analysis 67 - Anchor relative per-shell executables to the launch cwd

## Decision: Valid — fix applied

`resolvePerShellCommand` now anchors a path-like RELATIVE per-shell `executable.command` to an
absolute path against the configured `wcli0.launch.cwd` when one is set (resolved via
`resolveConfigPath`), falling back to the workspace folder when no cwd is set. Previously a relative
command was left unchanged whenever a launch cwd was configured.

**Why:** The server spawns `executable.command` with `cwd` set to the command's REQUESTED working
directory (`spawnCwd`), not the provider launch cwd, so a relative command would resolve under
whichever allowed directory a command runs from — usually failing to find the executable or running
a different file at that path. Anchoring to the launch cwd (where the user expects the relative
command to live) makes the spawned path deterministic. An unresolvable cwd is already blocked
separately by `validateLaunchSpec`, so `isUnanchorablePerShellCommand` stays correct. Verified by
updated `P51`/added `P67` tests in `configFile.test.cjs` (relative command resolves against the
configured cwd).

**Commit:** 4c5a136 — fix(vscode): address Codex round-9 review feedback for PR #86
