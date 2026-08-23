# P22 - Toggle the dirty indicator on edits

`#dirtyMsg` (the "Unsaved changes" span) is initialized with `display:none` and
nothing ever toggles it: the only dirty-state refresh path, `reflectDirty`, just
enables/disables the Revert button. So editing the `.vscode/mcp.json` source never
shows the promised indicator and the form gives no visible dirty status.
Reference: vscode-extension/src/webview.ts:839.
