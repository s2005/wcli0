# P25 - Push source resets through dirty file forms

When the primary workspace changes while a loaded `.vscode/mcp.json` form is dirty,
the host resets `currentSource` to settings, but the subsequent `post(true)` is treated
as an external reload and the webview returns before applying `setActiveSource`. The UI
therefore continues to show and save as the stale file source until the user trips the
rejected save path; the host should use a non-external source reset or a dedicated
source-change message for this workspace-change case.
Reference: vscode-extension/src/webview.ts:530.
