# P11 - Clear stale file-source notes after clean reloads

When a loaded file produces notes, later reloads or saves that produce no notes never
clear the old text because the host only posts a `notes` message when `notes.length` is
non-zero, and the webview keeps `sourceNotes` visible while still in `mcpJson` mode. For
example, after loading a custom URL warning and then saving a canonical URL, the warning
remains even though it no longer applies. The host should send an empty notes update (or
the webview should clear notes) on every file-source init.
File: `vscode-extension/src/webview.ts:286`.
