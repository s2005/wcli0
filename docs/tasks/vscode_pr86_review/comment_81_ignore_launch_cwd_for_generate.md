# P81 - Ignore launch cwd when it cannot affect generated config

The P75 validation in `generateConfigFile` (`vscode-extension/src/commands.ts`) blocks Generate
Config File on an unresolved `wcli0.launch.cwd` even when no relative per-shell executable command
depends on it. `buildConfigFile` does not emit or use the launch cwd, so (for example) with no
workspace open and `launch.cwd = "${workspaceFolder}/server"`, a valid standalone config cannot be
exported solely because of an unrelated launch-only setting. Filter the cwd problem unless it is
needed to resolve emitted per-shell content.
