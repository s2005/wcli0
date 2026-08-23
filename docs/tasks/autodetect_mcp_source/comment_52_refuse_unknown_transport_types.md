# P52 - Refuse saves for unknown transport types

When an entry uses a future or custom `type` such as `websocket`, the parser only
adds a note after modeling it as stdio; if the entry also has valid `command`/`args`,
Save to file is allowed and `mergeEntryOntoBase` replaces the original `type` with
`stdio` (and can delete URL-like fields). For unsupported transport types, the file
source should refuse saving or preserve the original type rather than silently
normalizing it after an unrelated edit.
Reference: `vscode-extension/src/configSource.ts:650` (`parseMcpEntry` unknown-type note)
and `vscode-extension/src/commands.ts` (`writeMcpJsonFromSettings`).
