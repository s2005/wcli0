# P2 - Reset file source when the primary folder changes

The workspace-folders subscription only clears the `.vscode/mcp.json` source when
no folders remain. In a multi-root workspace, or after removing/reordering
folders so `primaryWorkspaceFolder()` changes but still returns a folder,
`currentSource` stays `mcpJson` and `loadedFileSettings` still holds the old
folder's entry; the next `saveToFile` targets the new primary folder and can
overwrite that workspace's `.vscode/mcp.json` with the previous workspace's
config.

Reference: `vscode-extension/src/webview.ts` around line 430 (the
`onDidChangeWorkspaceFolders` handler).
