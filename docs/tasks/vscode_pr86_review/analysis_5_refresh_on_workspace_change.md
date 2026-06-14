# Analysis 5 - Refresh the provider when workspace folders change

## Decision: Valid - fix applied

The provider reads settings for `primaryWorkspaceFolder()` and resolves
`${workspaceFolder}` against it. In a multi-root workspace the first folder can be
removed or reordered with no `wcli0` setting change, and `onDidChangeConfiguration`
was the only automatic `provider.refresh()` trigger, so the cached definition kept
launching with the old primary folder's paths and resource-scoped settings. Fixed
by subscribing to `vscode.workspace.onDidChangeWorkspaceFolders` and calling
`provider.refresh()`; the disposable is pushed to `context.subscriptions`. Added
`onDidChangeWorkspaceFolders` and a `workspaceFoldersChangeListeners` array to the
test `vscode` stub to cover it.

**Why:** Keeps the published definition in sync with the effective workspace,
matching the existing intent of the configuration-change listener.

**Commit:** 6017df8 - fix(vscode): address Codex review feedback for PR #86
