# Analysis 81 - Reject host and port edits for opaque transport URLs

## Decision: Valid — fix applied

For an http/sse URL `parseHttpUrl` cannot decompose — a socket or named-pipe form such as
`unix:///tmp/server.sock#/mcp` — `parseMcpEntry` models neither host nor port (both stay at the form
defaults) and `preservedFileUrl` returns the raw URL verbatim so an unrelated save does not rewrite
it to `http://host:port/mcp` (P10). The host and port controls stay enabled though, and the network
save's stale-edit guard (P55) lists `transport.host` / `transport.port` as savable, so editing either
one was accepted, the original URL was written back unchanged, and the post-write reparse dropped the
edit behind a "Saved" — the same silent-loss shape P55 and P67 were opened for.

The fix adds a guard in `writeMcpJsonFromSettings`, before URL preservation is decided: for a file
source whose current on-disk URL is opaque and whose transport mode is unchanged, a `transportHost`
or `transportPort` differing from `defaultSettings()` is an unsavable edit, so the save is refused
with an error naming the URL and pointing at `.vscode/mcp.json`. Departure-from-default is the right
signal because that is exactly what the parser leaves for such a URL, the same test P67 uses for a
default-port URL. A mode switch still falls through to canonical reconstruction, where the host/port
fields do reach the written URL, and an untouched save still round-trips the URL verbatim (P10).

**Why:** Of the review's two options, refusing is the one that fits this codebase: disabling the
controls is a webview-only measure that P55 already showed to be insufficient (a disabled control
does not discard an edit made earlier), and serializing host/port into an opaque URL is impossible by
definition. The refusal also matches the parse note the user already sees for these URLs ("edit
.vscode/mcp.json directly to change it"), so the form's advice and its behavior now agree. See
[[analysis_10_preserve_socket_pipe_urls]] and [[analysis_67_rebuild_default_port_url_on_port_change]].

**Commit:** e7a73ce - fix(vscode): round-16 codex review follow-ups for PR #89 (P79-P82)
