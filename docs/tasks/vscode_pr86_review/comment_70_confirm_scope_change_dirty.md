# P70 - Prompt before discarding edits on scope changes

When the form has unsaved edits, changing the User/Workspace radio immediately posts `scopeChange`;
the host responds with a non-external `init`, which bypasses the dirty-form guard and replaces every
edited field. Thus an accidental scope switch silently loses all pending changes. Check `isDirty()`
and confirm (or save) before requesting the other scope, rather than unconditionally reloading it.

File: `vscode-extension/src/webview.ts:776` (scope radio change handler)
