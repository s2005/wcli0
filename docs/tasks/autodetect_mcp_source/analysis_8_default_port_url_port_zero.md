# Analysis 8 - Avoid loading default-port URLs as invalid port 0

## Decision: Valid — fix applied

`parseMcpEntry` no longer stores `transportPort = 0` for a URL that omits an explicit
port. It now keeps the form's default port (a valid `min=1` value), still sets the host,
retains the verbatim URL, and adds a note that the port field does not affect the
preserved URL. The save path's `preservedFileUrl` round-trips the loaded URL while the
host is unchanged (and rebuilds the canonical URL when the host is edited).

**Why:** Rendering `0` into the `transport.port` input (which has `min="1"`) made
`validateNumbers()` block Save, so an otherwise-unchanged default-port HTTP/SSE entry
could not be saved. Keeping a valid default port plus verbatim-URL preservation lets the
entry round-trip. Covered by updated `parseMcpEntry` tests and new file-save tests
(round-trip unchanged; rebuild on host edit).

**Commit:** 87784c3 — fix(vscode): address review feedback for PR #89 (round 2)
