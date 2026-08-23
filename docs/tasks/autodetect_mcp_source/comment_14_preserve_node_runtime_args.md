# P14 - Preserve node runtime arguments when loading entries

When an existing stdio entry launches with Node options, e.g. `command: "node",
args: ["--inspect", "dist/index.js", ...]`, the parser assumed the first argument is the
script path. A no-op Save then regenerated the entry with `${workspaceFolder}/--inspect`
as the script and moved the real script after the server flags, so the previously valid
MCP server no longer started. Treat such entries as custom and preserve the raw launcher
args unless the first arg is actually the script.
File: `vscode-extension/src/configSource.ts:370`.
