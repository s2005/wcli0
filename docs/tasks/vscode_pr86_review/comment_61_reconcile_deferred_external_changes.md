# P61 - Reconcile deferred external changes after saving

If an external settings change arrives while any form field is dirty, the webview drops
the entire update, including changes to untouched fields. After the user saves, the
`saved` message re-baselines the stale displayed values and no refresh follows; for
example, an external change from `safetyMode: safe` to `unsafe` during an unrelated
directory edit remains effective while the now-clean form continues showing safe.
Preserve dirty fields while merging untouched external values, or force a refresh after
the pending edit is saved.

File: `vscode-extension/src/webview.ts:800`
