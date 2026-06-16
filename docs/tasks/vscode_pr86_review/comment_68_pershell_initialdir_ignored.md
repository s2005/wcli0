# P68 - Do not expose a per-shell initial directory that is ignored

When a user configures `wcli0.shells.<name>.overrides.paths.initialDir`, the extension writes the
value into the shell override, but the server reads an initial directory only from
`config.global.paths.initialDir` during startup (`src/index.ts:309`); command execution and path
validation never consume the resolved shell-specific `initialDir` (it only appears in the
get_config summary). The extension therefore accepts and exports a setting that has no effect on
the shell's starting directory, so it should either apply/promote the value in a way the server
consumes or stop presenting it as functional.

File: `vscode-extension/src/configFile.ts:296` (applyPerShellOverrides)
