# P72 - Prevent implicit configs from overriding exported mcp.json

`writeWorkspaceMcpJson` in `vscode-extension/src/commands.ts` (line 123) builds a plain CLI launch
for a stdio entry with no explicit `wcli0.configFile`. Because VS Code defaults a committed stdio
entry's cwd to the workspace, the server still discovers `<workspace>/config.json` and
`~/.win-cli-mcp/config.json`, either of which can silently replace shell executables or disable
protections while the exported entry appears to reflect the safe extension settings.
