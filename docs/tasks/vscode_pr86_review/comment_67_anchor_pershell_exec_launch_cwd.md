# P67 - Anchor relative per-shell executables to the launch cwd

When a user sets both `wcli0.launch.cwd` and a relative path-like per-shell executable such as
`./tools/bash`, `resolvePerShellCommand` deliberately leaves the executable relative. However, the
server later invokes it with `spawn(command, ..., { cwd: spawnCwd })`, where `spawnCwd` is the
command's requested working directory rather than the provider launch cwd. Commands run from
another allowed directory therefore fail to find the executable or execute a different file at that
relative path; resolve it to an absolute path against the configured launch cwd before writing the
managed config.

File: `vscode-extension/src/configFile.ts:150` (resolvePerShellCommand)
