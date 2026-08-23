# P20 - Detect stale wcli0 entry changes before saving

If `.vscode/mcp.json` is edited after the panel loads it, the save path still merged onto
the original `loadedFileEntry`. `writeMcpJsonFromSettings` rereads the file but then
replaced `servers.wcli0` with the entry built from that stale base, so an unrelated Save
could silently discard external additions to the same entry (for example new `headers`,
`envFile`, or `oauth` fields) even though other servers were preserved. Re-read and merge
against the current on-disk entry before writing.
File: `vscode-extension/src/webview.ts:394`.
