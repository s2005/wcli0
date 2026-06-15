# Analysis 39 - Refresh the configuration form when workspace folders change

## Decision: Valid — fix applied

The form subscribed only to `onDidChangeConfiguration`, so adding or removing the first workspace folder
left its scope controls and `currentScope` stale: a view opened with no folder kept Workspace disabled
forever, and a view that had selected Workspace could keep that scope after the folder was removed (the
radio would re-force User on the next reload, but until then exports ran against the wrong scope).
Subscribed to `vscode.workspace.onDidChangeWorkspaceFolders`; on fire, if no folder remains and
`currentScope === 'Workspace'`, normalize to `'Global'` first, then `post(true)` so the webview
re-renders the scope controls and re-reads the now-current settings. The disposable is cleaned up on
panel/view dispose alongside the existing configuration subscription.

**Why:** Round-1 P5 added the same subscription to the MCP provider for the same reason — the primary
folder drives `${workspaceFolder}` resolution and scope selection, and the form is just as dependent on
it. The form's `external` reload guard (round-4 P35) still applies, so this refresh won't clobber unsaved
edits; it only ensures the scope metadata and control state track reality.

**Commit:** b56a677 — fix(vscode): address Codex round-5 review feedback for PR #86
