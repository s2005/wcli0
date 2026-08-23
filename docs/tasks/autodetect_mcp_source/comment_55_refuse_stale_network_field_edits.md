# P55 - Refuse stale edits before locking network file fields

Disabling the non-transport tab controls when a file entry switches to `http`/`sse`
does not discard edits the user already made while the entry was still `stdio`. If
they change `safetyMode` or `configFile`, then switch Transport to a network mode and
click Save to file, `collectChanged()` still submits those values, but the network save
writes only `{type, url}` and reports success, so the post-save reparse silently drops
the edits behind a misleading "Saved" indicator. The save must clear or reject
non-transport changes when writing a network file entry.
File: `vscode-extension/src/webview.ts:1539` (`applyFileTransportLock`).
