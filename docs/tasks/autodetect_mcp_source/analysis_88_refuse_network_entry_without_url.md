# Analysis 88 - Refuse network entries without a usable URL

## Decision: Valid â€” fix applied

For a file-source http/sse save the URL is either preserved verbatim or rebuilt from host/port. An
entry with no usable url -- `{"type":"http"}`, `url: ""`, or a non-string url -- has nothing to
preserve, so it fell through to the canonical fallback and an unrelated (even empty) save wrote
`http://127.0.0.1:9444/mcp`. An entry that pointed nowhere silently became one pointing at a live
local endpoint the user never chose, which is a security-relevant change of where the client
connects, not merely a formatting one.

The fix keeps the url key exactly as found -- absent stays absent, an empty or non-string value
round-trips -- while the transport mode, host and port are all still at what the parser left
(`keepMissingUrl`). A real host/port edit, or a transport-mode switch, still writes the rebuilt URL,
so the form remains the way to fix such an entry. A parse note tells the user the entry has no usable
url, that saving keeps it as-is, and how to set one.

**Why:** Of the review's two options, preserving beats refusing here: refusing would block every
unrelated edit on an entry the form is otherwise perfectly able to edit, while preservation is the
rule this feature already applies to every other unrepresentable value (a socket URL P10, an
out-of-range port P59, a non-positive limit P64, conflicting safety flags P70). Gating on
"host and port untouched" reuses the P67/P81 test for a deliberate endpoint edit, so the only save
that writes a URL is one where the user actually chose it. See
[[analysis_10_preserve_socket_pipe_urls]] and [[analysis_81_reject_host_port_edits_for_opaque_urls]].

**Commit:** f563e8a - fix(vscode): round-18 codex review follow-ups for PR #89 (P87-P88)
