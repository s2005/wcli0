# P7 - Preserve HTTP/SSE auth fields when saving

For an existing HTTP/SSE `servers.wcli0` entry that uses VS Code-supported fields such
as `headers` or `oauth`, saving from the file source replaces the whole entry with only
`{ type, url }`, dropping the authentication/configuration metadata even when the user
edits an unrelated form field. The remote MCP server can then stop connecting after a
load/save round trip. The write path should merge the generated fields into the loaded
entry instead of reconstructing it from scratch.
File: `vscode-extension/src/commands.ts:354`.
