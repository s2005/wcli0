# P28 - Avoid retargeting dirty file edits to settings

When the primary workspace changes while a `.vscode/mcp.json` source is dirty, the
`sourceReset` handler switches the client back to the settings source but deliberately
leaves the old file values and the file-relative dirty baseline in the form. The next
click on the now-renamed "Save settings" button posts a normal `save` message, so the
unsaved edits from the old file are written into `wcli0.*` settings for the current scope
instead of being discarded or reloaded. This can corrupt workspace/user settings after
exactly the folder-change scenario the reset is meant to protect. The webview should
guard a settings save whose baseline came from a now-gone file source behind an explicit
confirmation.
File: `vscode-extension/src/webview.ts:1985`.
