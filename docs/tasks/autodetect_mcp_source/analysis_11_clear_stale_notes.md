# Analysis 11 - Clear stale file-source notes after clean reloads

## Decision: Valid — fix applied

File-source parse notes are now carried in every `init` message (the `notes` field of
`post()`), replacing the previous fire-once `notes` message that was only sent when notes
were non-empty. The host stores `loadedFileNotes` and resets it on switch/save/reload, and
the webview renders notes from each file-source init — clearing them when the array is
empty.

**Why:** Because the host only posted notes when `notes.length > 0` and the webview kept
`sourceNotes` visible while in `mcpJson` mode, a stale warning (e.g. a custom-URL note)
remained after a later clean reload/save. Sending notes on every init clears them. Covered
by a webview test that loads a noteful entry then reloads a clean one and asserts the notes
are cleared.

**Commit:** 87784c3 — fix(vscode): address review feedback for PR #89 (round 2)
