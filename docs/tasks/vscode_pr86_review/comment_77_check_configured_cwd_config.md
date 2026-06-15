# P77 - Check the exported entry's configured cwd for config.json

The P72 override warning in `writeWorkspaceMcpJson` (`vscode-extension/src/commands.ts`) checks only
`<workspace>/config.json`. When `wcli0.launch.cwd` points elsewhere (e.g. `${workspaceFolder}/sub`),
the exported entry launches from that cwd, and the server's `loadConfig` discovers
`<cwd>/config.json` from `process.cwd()`, silently replacing executables or weakening restrictions
without the warning firing. The check must look in the configured launch cwd, not the workspace root.
