# Analysis 2 - Reject untrusted Origin headers on HTTP transport

## Decision: Valid -- fix applied

DNS-rebinding against a localhost listener is a documented MCP threat, and the
transport performed no `Origin` checking. The fix adds an origin allowlist in
`src/utils/transport.ts`: requests with no `Origin` header (native MCP clients,
curl) are still accepted, but a present `Origin` must resolve to a loopback host
(`localhost`, `127.0.0.1`, `::1`) or to the configured bind host. Disallowed or
malformed origins -- including the literal `null` origin used by sandboxed
iframes and `file://` pages -- are rejected with `403 Forbidden` on both
`GET /sse` and `POST /messages`, before any session is created or message is
routed.

**Why:** The `Origin` header reflects the page the request originated from, not
the rebound IP, so allowlisting trusted origins defeats DNS rebinding even when
the attacker's domain resolves to `127.0.0.1`. Allowing the no-`Origin` case
keeps non-browser clients (and the existing integration tests, which use bare
`http.get`/`http.request`) working, matching the SDK's own
`enableDnsRebindingProtection` posture of validating only when the header is
present.

**Commit:** 57358aa -- fix(transport): address Codex review feedback for PR #83
