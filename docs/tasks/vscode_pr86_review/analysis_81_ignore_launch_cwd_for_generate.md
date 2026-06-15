# Analysis 81 - Ignore launch cwd when it cannot affect generated config

## Decision: Valid — fix applied

`generateConfigFile` now filters the `wcli0.launch.cwd` blocking problem out of the config-generation
validation UNLESS a new `launchCwdAffectsConfig` predicate reports that an enabled shell has a
path-like RELATIVE executable command (the only emitted content `buildConfigFile` anchors against the
launch cwd). When no such command exists, an unresolved launch cwd no longer blocks Generate Config
File.

**Why:** the launch cwd never appears in the generated config; it only matters when
`resolvePerShellCommand` anchors a relative per-shell command to it. Filtering it otherwise lets a
valid standalone config export even with an unrelated, unresolved launch-only cwd (e.g. no workspace
open). When a relative per-shell command does depend on the cwd, the problem is retained so a
mis-anchored executable path is still refused. Verified by added `P81` tests in `commands.test.cjs`
(generation proceeds with a launch-only unresolved cwd; still blocks when a relative per-shell command
needs it).
