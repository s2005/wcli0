# P29 - Refuse file-source shell/profile edits that cannot be saved

When editing a `.vscode/mcp.json` source that references a loadable `--config`, changes
made on the Shells or Profiles tabs are overlaid onto the loaded baseline and can pass the
"Write anyway" warning, but `writeMcpJsonFromSettings` only writes the mcp.json entry and
never updates the referenced config file where those settings would have to live. The
subsequent reparse from disk drops those edits while still showing a successful save, so
users silently lose the per-shell/profile changes they just made in the file-source form.
A file-source save that carries per-shell or profile edits should be refused with a clear
message pointing the user at the referenced config file.
File: `vscode-extension/src/webview.ts:394`, `vscode-extension/src/commands.ts:389`.
