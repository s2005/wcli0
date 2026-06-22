# Analysis 16 - Re-post source detection after workspace changes

## Decision: Valid — fix applied

After the synchronous re-post on a workspace-folder change, `wsSub` now refreshes the
detection cache and pushes a dedicated `detected` message; the webview's new `detected`
handler updates only the source-switcher rows and the "Load & edit" banner (via a factored
`applyDetected`) without touching scope or field values.

**Why:** The handler previously posted stale cached detection and refreshed without
re-posting, so opening a folder that already had `.vscode/mcp.json` left the banner/row
absent until an unrelated post. A full init re-post would reintroduce the P96 scope-race;
a detection-only message updates the UI safely. Covered by a webview test asserting a
`detected` message with the wcli0 entry is pushed after a folder change; the P96 test
still passes.

**Commit:** 3eccda7 — fix(vscode): address review feedback for PR #89 (round 3)
