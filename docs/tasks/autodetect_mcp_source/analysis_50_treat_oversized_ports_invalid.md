# Analysis 50 - Treat oversized URL ports as invalid

## Decision: Valid — fix applied

`parseMcpEntry`'s http/sse branch modeled any explicit port `> 0` as "fully modeled",
so a malformed `url: "http://localhost:70000/mcp"` loaded `70000` into the form's
`<input max="65535">`. The number input then failed client-side validation, blocking
every unrelated save until the user noticed and edited the port. Only `:0` was routed
to the unusable-port recovery branch.

The fix narrows the "fully modeled" condition to `port >= 1 && port <= 65535`, so an
out-of-range port falls through to the same unusable-port branch as `:0`: the host is
modeled, the port keeps the form default, a note explains the canonical URL is rebuilt
on save, and `preservedFileUrl` does not round-trip the out-of-range URL verbatim (the
default port can never match it), so the save rebuilds a valid `http://host:port` form
instead of writing back the invalid port.

**Why:** The form's port field is constrained to `1..65535`; a value it cannot hold
must be treated as unusable, exactly like `:0`, so loading a malformed URL never strands
the form in an invalid state. Reusing the existing unusable-port branch keeps the
behavior and the note consistent (P-port0/P-portmax).

**Proposed fix:** In `parseMcpEntry`, gate the fully-modeled branch on
`parsed.port >= 1 && parsed.port <= 65535`.

**Commit:** 8be428b — fix(vscode): round-8 codex review follow-ups for PR #89 (file-source save round-trip)
