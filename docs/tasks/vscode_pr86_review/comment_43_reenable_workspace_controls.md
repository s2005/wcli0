# P43 - Re-enable workspace controls when a folder is added

When the view opens with no workspace folder the Workspace radio and the
`.vscode/mcp.json` export button are disabled and the no-workspace hint is shown,
but a later `init` with `hasWorkspace: true` has no branch to reverse this. Adding
a folder to the same window therefore leaves workspace configuration and export
unavailable until the webview is recreated. Reported on
`vscode-extension/src/webview.ts:722`.
