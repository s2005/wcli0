# P51 - Anchor relative per-shell executable commands

When a per-shell executable is configured as a relative path such as `./tools/bash`
and `wcli0.launch.cwd` is unset, the config writes the path unchanged. Managed
launches deliberately run the server from a private extension-storage directory, and
the server passes `executable.command` directly to `spawn`, so the executable is
resolved under that private directory and fails to start. Anchor path-like relative
commands to the workspace, as is already done for custom launch commands, or reject
them when no anchor exists.

File: `vscode-extension/src/configFile.ts:152`
