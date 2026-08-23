# P6 - Reject stale file-source saves after workspace changes

If the primary workspace folder changes while a `.vscode/mcp.json` form has unsaved
edits, `wsSub` clears `currentSource`/`loadedFileSettings`/`loadedFileFolder` and posts
an external init, but the webview ignores that init while dirty and still sends
`saveToFile`. The host fallback then overlays the stale form values onto
`defaultSettings()` and writes them to the new primary folder, which is exactly the
wrong-folder overwrite the reset is meant to avoid. The host should reject `saveToFile`
unless it is still in `mcpJson` mode and `loadedFileFolder === folder.uri.fsPath`.
File: `vscode-extension/src/webview.ts:362`.
