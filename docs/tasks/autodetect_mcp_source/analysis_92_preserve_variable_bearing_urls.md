# Analysis 92 - Preserve variable-bearing network URLs

## Decision: Valid â€” fix applied

`parseHttpUrl`'s authority regex treats the first colon after the host as the port delimiter, but in
`http://${input:host}:8080/mcp` that colon is inside a VS Code substitution token. The URL decomposed
to host `${input` with a malformed port, so the form showed a truncated host and the default port,
and `preservedFileUrl` â€” seeing a decomposable URL whose host/port did not match the form â€” rebuilt
it. A no-op save wrote `http://${input:9444/mcp`, destroying both the variable and the endpoint. The
mirror case `http://host:${input:port}/mcp` fails the same way.

The fix reports any URL whose authority contains a `${` token as undecomposable, which routes it into
the path already built for socket and named-pipe URLs: the verbatim URL is retained and re-emitted
untouched (P10), the parse note tells the user to edit `.vscode/mcp.json` directly, and a host/port
edit is refused rather than silently applied (P81). Plain URLs, including one whose host happens to
be a bare `${NAME}` with no colon, are unaffected.

**Why:** These values are unknowable until VS Code resolves them at launch, so any host/port the form
could show would be fiction â€” "cannot be represented by these fields" is literally true, and the
codebase already has a correct, tested behavior for that state. Checking only the authority (not the
whole URL) keeps a variable in the PATH from disabling decomposition unnecessarily. See
[[analysis_10_preserve_socket_pipe_urls]] and [[analysis_81_reject_host_port_edits_for_opaque_urls]].

**Commit:** 5d7e6fe - fix(vscode): round-19 codex review follow-ups for PR #89 (P89-P92)
