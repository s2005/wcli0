# P67 - Rebuild default-port URLs when the port changes

In `vscode-extension/src/commands.ts:255` (`preservedFileUrl`), a loaded http/sse file
entry whose URL omits an explicit port (for example `https://gateway.example/custom/mcp`)
is preserved verbatim whenever the host is unchanged, regardless of the port field. The
webview still accepts a pure `transport.port` edit and the host reports the save as
savable, so a port-only edit reports "Saved" while writing the original URL back unchanged;
the subsequent reparse then drops the user's edited port. A port change must be treated as a
reason to rebuild the canonical `http://host:port/<mcp|sse>` URL (mirroring the existing
host-edit behavior) rather than silently discarding the edit.
