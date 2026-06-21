# P16 - Re-post source detection after workspace changes

When the panel is open and the primary workspace folder is added or changed, the handler
posted the old cached `detectedSources` and then refreshed the cache without sending
another update. In the common case of opening a folder that already has `.vscode/mcp.json`,
the "Load & edit" banner and source-menu row stayed absent until some unrelated event
posted again, so auto-detection did not work for workspace changes.
File: `vscode-extension/src/webview.ts:541`.
