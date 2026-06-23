# Analysis 66 - Reject non-numeric URL ports instead of treating them as omitted

## Decision: Valid — fix applied

`parseHttpUrl` matched the port with an optional digit-only group
(`(?::(\d+))?`), so a URL with an explicit but non-numeric port
(`http://host:abc/mcp`, `http://host:-1/mcp`) matched the host with the port
group skipped, yielding `port: undefined`. Both the load path (`parseMcpEntry`)
and the save path (`preservedFileUrl`) treat an undefined port as an
omitted/default-port URL and preserve it verbatim while the host is unchanged, so
editing only the port field could never fix the malformed URL. The fix changes
the regex to capture the explicit port token even when malformed
(`(?::([^/?#]*))?`) and classifies it: absent group -> `undefined` (omitted),
digit-only -> its number, anything else -> `NaN` (explicit but unusable).

**Why:** Reporting a malformed port as `NaN` (distinct from `undefined`) routes
it through the existing unusable-port branch shared with `:0`/`:70000`: the host
is modeled, the form keeps its default port, and `preservedFileUrl`'s
`parsed.port === settings.transportPort` check is always false for `NaN`, so the
save rebuilds the canonical `http://host:port` URL from the (editable) port field
instead of round-tripping the broken URL. The load-path note was extended to
describe a non-numeric port distinctly, and the port group stops at `/?#` so a
valid numeric port followed by a path/query/fragment is still read correctly.

**Commit:** 18dc478 — fix(vscode): round-12 codex review follow-ups for PR #89 (P63-P66)
