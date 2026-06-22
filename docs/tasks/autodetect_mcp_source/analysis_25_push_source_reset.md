# Analysis 25 - Push source resets through dirty file forms

## Decision: Valid — fix applied

When the primary workspace folder changed, the host reset `currentSource` to settings and
re-posted with `post(true)`, but a dirty webview ignores an external init (so it does not
discard edits) and therefore never applied the source switch — the UI kept showing and
saving as the now-gone file source until a save was rejected. The host now posts a
dedicated `sourceReset` message (only when the file source was actually reset), and the
webview handles it by calling `setActiveSource('settings', ...)` and clearing stale parse
notes, switching off the file source even while dirty. Field values and the dirty state
are left untouched, so unsaved edits are not discarded.

**Why:** The external-init dirty guard is correct for field values but wrongly suppressed
the source switch too. A separate message cleanly carries the source change without
touching fields, mirroring the existing `detected` message pattern (P16/P96). This
complements the P6 stale-save rejection by fixing the UI state proactively rather than
only at save time. Covered by webview.test.cjs P25 (sourceReset posted on folder change,
not posted when settings was active) and webviewButtons.test.cjs P25 (the webview switches
off the file source on a dirty form).

**Commit:** baf060b — fix(vscode): address review feedback for PR #89 (round 4)
