# P13 - Allow VS Code input variables in loaded --config paths

When a loaded stdio entry contains a VS Code-substituted config argument such as
`--config ${input:cfg}`, the parser maps it into `settings.configFile` and the file-source
save validation treats the unresolved `${...}` as a blocking, unanchorable path. That means
an otherwise valid `.vscode/mcp.json` entry that VS Code resolves at launch cannot be saved
after any unrelated edit. File-source saves should preserve those argv values and skip the
local loadability/anchorability checks for variable-backed paths from `mcp.json`.
File: `vscode-extension/src/commands.ts:248`.
