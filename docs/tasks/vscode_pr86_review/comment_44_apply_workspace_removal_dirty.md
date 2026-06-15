# P44 - Apply workspace-removal state even while the form is dirty

When the last workspace folder is removed while the form has unsaved edits, the
host changes `currentScope` to Global and posts an external `init`, but the
webview's early return for dirty external reloads leaves the Workspace radio
selected and enabled. Pressing Save then sends `target: 'Workspace'`, causing
`applySettings` to attempt a Workspace update with no workspace open. Scope and
availability changes must apply even when the field-value refresh is skipped.
Reported on `vscode-extension/src/webview.ts:709`.
