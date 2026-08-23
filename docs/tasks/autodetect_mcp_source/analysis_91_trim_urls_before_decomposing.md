# Analysis 91 - Trim URLs consistently before decomposing them

## Decision: Valid â€” fix applied

`parseMcpEntry` decomposed `entry.url` untrimmed while `preservedFileUrl` trims before parsing, so
the two paths disagreed about the same entry. For `" http://gateway.example:8443/mcp"` the parser
saw an undecomposable URL and left the form at the default host and port; the save path decomposed it
successfully, compared `gateway.example:8443` against those displayed defaults, found a mismatch,
concluded the user had edited the endpoint and rewrote it to `http://127.0.0.1:9444/mcp`. A no-op
save silently repointed the client at a different server.

The fix trims in `parseMcpEntry` too, so both paths decompose the identical string. The entry loads
with its real host and port shown and editable, and the stored `transportUrl` is the trimmed form â€”
matching what the save writes back, so the round-trip is stable.

**Why:** Every preservation decision in this feature compares what the parser modeled against what
the form now holds; that comparison is only sound while both sides parse the same value. Trimming at
the single point where the URL enters the model is the smaller and safer half of the review's two
options â€” the alternative, teaching both paths to preserve untrimmed input, would leave the form
unable to show or edit an endpoint over a stray space. See
[[analysis_5_preserve_http_sse_urls]] and [[analysis_67_rebuild_default_port_url_on_port_change]].

**Commit:** 5d7e6fe - fix(vscode): round-19 codex review follow-ups for PR #89 (P89-P92)
