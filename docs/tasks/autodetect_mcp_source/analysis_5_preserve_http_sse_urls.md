# Analysis 5 - Preserve full HTTP/SSE URLs when round-tripping

## Decision: Valid — fix applied

Loading an http/sse entry kept only host and port, so a save rebuilt the URL as
`http://host:port/{mcp,sse}` — silently downgrading custom schemes/paths (e.g.
`https://gateway.example/custom/mcp`) and breaking URLs that relied on a default
port. Fixed by preserving the verbatim URL through the round-trip: added an
optional `transportUrl` field to `Wcli0Settings` (set only by the file-source
reverse parser, never a `wcli0.*` setting), and `writeMcpJsonFromSettings` now
writes that URL back unchanged while it still parses to the host/port shown in
the form, falling back to the canonical reconstruction only when the user edited
the host/port. The standalone port validation is skipped for a preserved URL so a
default-port URL stays saveable. `parseMcpEntry` also adds a note when the URL is
non-canonical, so the user knows editing host/port will rewrite it.

**Why:** The form models only host/port, so it cannot represent an arbitrary URL.
Preserving the original verbatim (and warning when it cannot be fully modeled)
matches the reviewer's "preserve the original URL parts or refuse" guidance
without expanding the form, and avoids silent corruption of externally-hosted
endpoints.

**Commit:** 81ab523 — fix(vscode): address review feedback for PR #89
