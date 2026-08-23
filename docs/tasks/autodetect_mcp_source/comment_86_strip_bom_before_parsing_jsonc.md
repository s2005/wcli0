# P86 - Strip UTF-8 BOMs before parsing detected JSONC

In `vscode-extension/src/configSource.ts:68` (`detectWorkspaceMcpJson`), a `.vscode/mcp.json` saved
with VS Code's UTF-8-with-BOM encoding keeps its leading `U+FEFF` through `Buffer.toString('utf8')`,
and the home-grown `parseJsonc` passes it to `JSON.parse`, which throws; the catch then reports the
file as having no detectable wcli0 entry, and `readWcli0Entry` fails the same way, so the new
load/edit feature is unavailable for an otherwise VS Code-readable JSONC file. A leading BOM must be
removed before parsing, preferably centrally in that parser.
