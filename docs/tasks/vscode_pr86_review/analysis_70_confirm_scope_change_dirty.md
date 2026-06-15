# Analysis 70 - Prompt before discarding edits on scope changes

## Decision: Valid — fix applied

Switching the User/Workspace radio now checks `isDirty()` first. When the form has unsaved edits the
webview reverts the radio to the currently-loaded scope and posts `scopeChangeRequest`; the host
shows a modal warning (`showWarningMessage({ modal: true }, 'Discard changes')`). Only on explicit
confirmation does the host change `currentScope` and re-post the other scope's values; cancelling
leaves the edits and the original scope intact. A clean form switches immediately as before.

**Why:** The host's reply to `scopeChange` is a non-external `init`, which intentionally bypasses the
dirty guard (the guard only defers background/external reloads), so an accidental scope toggle
silently discarded pending edits. A modal confirmation driven by the host is the correct pattern —
`window.confirm` is unavailable in VS Code webviews. The webview tracks the loaded scope (`formScope`)
so it can revert the radio while awaiting confirmation. Verified by added `P70` tests in
`webview.test.cjs` (dirty scope change requests confirmation; confirm switches, cancel preserves).

**Commit:** 4c5a136 — fix(vscode): address Codex round-9 review feedback for PR #86
