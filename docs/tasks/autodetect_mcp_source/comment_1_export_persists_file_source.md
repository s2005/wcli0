# P1 - Prevent export actions from persisting file-source edits

When the active source is `.vscode/mcp.json`, only the main Save button is
redirected to `saveToFile`; the Export tab buttons (`Show launch command`,
`Generate config.json`, `Write .vscode/mcp.json`) still call `exportAction`,
which posts `values`/`target` and makes the host run `applySettings` before
exporting. Editing the loaded file entry and clicking an export action writes the
partial file-source diff into `wcli0.*` settings and generates output from
settings rather than the loaded file baseline, corrupting the user's settings.

Reference: `vscode-extension/src/webview.ts` around line 1528 (export handler /
`exportAction`).
