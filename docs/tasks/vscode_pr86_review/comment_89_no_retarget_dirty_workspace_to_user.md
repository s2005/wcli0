# P89 - Do not retarget dirty workspace edits to User scope

In `vscode-extension/src/webview.ts:1074`, when a Workspace-scoped form has unsaved edits and its
last workspace folder is removed, the host sends an external Global init; `applyWorkspaceAvailability`
switches the checked radio to Global before the dirty guard returns without loading Global values or
updating `formScope`. Clicking Save then submits the still-Workspace values with `target: 'Global'`,
unexpectedly persisting project-specific launch or safety settings into User scope. Keep the dirty
form targeted to its loaded scope, or require discard confirmation before retargeting it.
