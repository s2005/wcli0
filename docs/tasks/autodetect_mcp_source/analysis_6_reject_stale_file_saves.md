# Analysis 6 - Reject stale file-source saves after workspace changes

## Decision: Valid — fix applied

Added a guard at the top of the `saveToFile` host handler in `webview.ts`: a file-source
save now proceeds only while `currentSource === 'mcpJson'`, `loadedFileFolder ===
folder.uri.fsPath`, and the loaded raw entry is still present. When the primary workspace
folder changes (multi-root removal/reorder), `wsSub` resets the file source, so a dirty
webview that ignored the external init and still posts `saveToFile` is now rejected with
an explanation instead of overwriting the new folder's `.vscode/mcp.json` with the
previous folder's config.

**Why:** This is the P1 wrong-folder overwrite the P2 reset was meant to prevent; the
reset alone is insufficient because the webview's dirty guard suppresses the external init
that would otherwise flip the client out of file mode. Verified by a new unit test that
changes the primary folder after loading a file source and asserts the save is refused and
nothing is written to the new folder.

**Commit:** 87784c3 — fix(vscode): address review feedback for PR #89 (round 2)
