# P49 - Disable settings-only masks for file sources

When `source` is `mcpJson` and the loaded entry is stdio, the source switch leaves
`ignoreInheritedShells` and `ignoreInheritedProfiles` editable whenever the prior
settings scope was Workspace; only http/sse file entries lock those panels. Those
masks are settings-only and are not emitted to `.vscode/mcp.json`, so changing just
one of them lets `Save to file` succeed and then the post-save reparse drops the edit
while showing Saved. Disable or reject these controls while editing any file source.
Reference: `vscode-extension/src/webview.ts:1960` (`setActiveSource` / `applyScopeAvailability`).
