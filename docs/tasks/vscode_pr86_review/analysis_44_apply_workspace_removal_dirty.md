# Analysis 44 - Apply workspace-removal state even while the form is dirty

## Decision: Valid - fix applied

The `init` handler returned early for an external reload while the form was dirty
(round-4 P35), which also skipped the scope availability/selection update. So when
the last folder was removed mid-edit, the host normalized `currentScope` to Global
and re-posted, but the webview kept the Workspace radio selected and enabled; a
subsequent Save sent `target: 'Workspace'` with no workspace open. Moved
`applyWorkspaceAvailability(msg.hasWorkspace)` and the scope-radio selection ABOVE
the dirty guard, and made radio selection skip a disabled radio. Only the
field-value refresh (`setVal` + re-baseline) remains behind the dirty guard, so
edits are preserved while scope state tracks reality.

**Why:** Preserving unsaved edits (P35) must not come at the cost of pointing Save
at a non-existent scope. Splitting "scope/availability always applies" from
"field values only when clean" satisfies both: the user's in-progress values
survive and a later Save targets the valid Global scope.

**Commit:** 11d813f - fix(vscode): address Codex round-6 review feedback for PR #86
