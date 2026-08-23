# P81 - Reject host and port edits for opaque transport URLs

In `vscode-extension/src/commands.ts:251` (`preservedFileUrl`), a loaded HTTP/SSE entry whose URL is
opaque -- such as `unix:///tmp/server.sock#/mcp`, for which `parseHttpUrl` returns undefined -- keeps
its original URL regardless of the form's host or port, yet those controls remain editable and their
changes are accepted as network-savable edits, so changing either one reports a successful save while
writing the original URL back and the subsequent reparse discards the edit. Host/port changes must be
disabled or rejected for such URLs, or an accepted edit must actually affect the serialized URL.
