# P3 - Preserve dash-prefixed custom launcher args

For custom launch entries, treating the first dash-prefixed argument as the start
of wcli0 server flags breaks valid `wcli0.launch.customArgs` values that are
themselves options, such as `command: "node"` with
`customArgs: ["--inspect", "dist/index.js"]` or wrapper commands like
`uvx --from ...`. Loading and saving such an entry moves those launcher arguments
into `extraArgs` after the generated server flags, changing the command order and
often making the saved `.vscode/mcp.json` no longer launch the intended
wrapper/server.

Reference: `vscode-extension/src/configSource.ts` around line 319 (custom branch
of `parseMcpEntry`).
