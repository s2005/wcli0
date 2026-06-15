# P39 - Refresh the configuration form when workspace folders change

The form only refreshes for configuration changes, so adding or removing the first workspace folder while the view is open leaves its scope controls stale. For example, a view opened without a folder permanently keeps Workspace and "Write .vscode/mcp.json" disabled after a folder is added; after removal it can retain `currentScope === 'Workspace'` even if the UI later forces the User radio, causing exports to read the wrong scope. Subscribe to `onDidChangeWorkspaceFolders`, normalize `currentScope` when no folder remains, and repost the form state.

Reference: `vscode-extension/src/webview.ts:137` — <https://github.com/s2005/wcli0/pull/86#discussion_r3410248389>
