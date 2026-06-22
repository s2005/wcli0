# Analysis 10 - Preserve socket and pipe URLs instead of rewriting them

## Decision: Valid — fix applied

`parseMcpEntry` now retains the verbatim `transportUrl` even when `parseHttpUrl` cannot
decompose it (socket/named-pipe URLs such as `unix:///tmp/server.sock#/mcp`), leaving the
host/port fields at their defaults and adding a clear note. On save, `preservedFileUrl`
returns the raw URL for any URL it cannot decompose (when the transport mode is unchanged),
so an unrelated save no longer rewrites it to `http://127.0.0.1:9444/mcp`.

**Why:** The previous code only added a note and left `transportUrl` unset, so the save
path reconstructed the URL from the default host/port and broke the configured
socket/named-pipe server. Preserving the original URL fixes the round trip. Covered by a
`parseMcpEntry` socket-URL test and a file-save test asserting the socket URL is preserved.

**Commit:** 87784c3 — fix(vscode): address review feedback for PR #89 (round 2)
