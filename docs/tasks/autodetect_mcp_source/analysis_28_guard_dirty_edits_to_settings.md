# Analysis 28 - Avoid retargeting dirty file edits to settings

## Decision: Valid — fix applied

After a folder change reset a dirty `.vscode/mcp.json` source, the `sourceReset` handler
switched the form to the settings source but deliberately kept the file's values and a
file-relative dirty baseline (P25, so unsaved edits are not discarded). The renamed "Save
settings" button then posted a normal `save`, writing those file-derived edits into
`wcli0.*` settings for the current scope — and against the wrong (file) diff baseline —
silently after exactly the scenario the reset was meant to protect. The webview now sets a
`resetFromFileSource` flag on `sourceReset` and tags a settings save with
`fromResetFileSource` while that stale baseline is still dirty; the host shows a modal
("these values came from a .vscode/mcp.json source that is no longer active … save them
anyway?") and writes only on confirm. The flag clears whenever the form re-baselines to
real values (any applied init / a save), so ordinary saves are never gated.

**Why:** This honors both constraints that were in tension: P25 keeps the user's edits on
screen (nothing is discarded), while a confirmation stops them from silently corrupting
settings. Routing the modal through the host matches the existing pattern (window.confirm
is unavailable in a VS Code webview, see P70). The approach was chosen with the user over
re-baselining (which would make Save silently no-op) and discarding edits (which would
contradict P25). Covered by webview.test.cjs P28 (a flagged save is confirmed before
writing; confirm persists; an unflagged save is not gated) and webviewButtons.test.cjs P28
(a save after a reset is flagged; the flag clears after re-baseline).

**Commit:** a233fef — fix(vscode): address review feedback for PR #89 (round 5)
