# Analysis 89 - Do not retarget dirty workspace edits to User scope

## Decision: Valid — fix applied

Three coordinated changes in `vscode-extension/src/webview.ts` keep a dirty Workspace-scoped form
targeted to its loaded scope when the last workspace folder is removed:

1. `applyWorkspaceAvailability` switches the checked radio to Global on folder removal only when the
   form is NOT a dirty Workspace form (`!(isDirty() && formScope === 'Workspace')`); a dirty Workspace
   form keeps Workspace selected.
2. The init handler's dirty guard now runs BEFORE the `msg.scope` radio assignment, so an external
   reload while dirty skips both the field refresh and the scope-radio switch — the loaded scope
   stays selected and Save targets it.
3. The host's `applySettings` refuses a Workspace save when no workspace folder is open (shows an
   error, writes nothing, returns false); the save/export handlers abort on a refused save.

**Why:** previously, removing the last folder made the host post an external Global init;
`applyWorkspaceAvailability` (and the `msg.scope` assignment) flipped the checked radio to Global
before the dirty guard returned without loading Global values or updating `formScope`. A subsequent
Save submitted the still-Workspace values with `target: 'Global'`, persisting project-specific launch
or safety settings into User scope. Keeping the loaded scope selected (and refusing an impossible
Workspace save with a clear message) prevents the silent cross-scope leak. The earlier P44 behavior
(auto-switch to Global to "target a valid scope") is what introduced this bug, so its test was
updated to assert the corrected behavior. Verified by the updated `P44/P89` test and new `P89` tests
in `webviewShells.test.cjs` (save targets Workspace) and `webview.test.cjs` (host refuses the
folderless Workspace save).

**Commit:** df1378b — fix(vscode): address Codex round-12 review feedback for PR #86
