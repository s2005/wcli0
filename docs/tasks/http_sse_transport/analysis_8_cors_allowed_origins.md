# Analysis 8 - Return CORS headers for allowed browser origins

## Decision: Valid -- fix applied

The origin allowlist accepted a browser request but the responses carried no
`Access-Control-Allow-Origin`, and a cross-origin `POST /messages` with
`application/json` triggers an `OPTIONS` preflight that fell through to the 404
branch. A page served from an allowed loopback origin on a different port could
therefore pass the origin check yet still have the browser block the response
before the MCP handshake completed. The fix, applied after the origin check
passes, echoes the request's `Origin` (plus `Vary: Origin`) on the SSE response,
the `POST /messages` response, and the error responses, and answers `OPTIONS`
preflight requests with `204` and
`Access-Control-Allow-Methods: GET, POST, OPTIONS` /
`Access-Control-Allow-Headers: Content-Type`. CORS headers are added through
`res.setHeader()` before the SDK transport writes its own headers (which
`writeHead()` merges), so the echoed origin survives onto the `200`/`202`
responses. Non-browser clients send no `Origin` and receive no CORS headers, so
their behavior is unchanged. New tests cover the preflight, the echoed header on
`GET /sse`, the disallowed-origin 403 without CORS, and the no-Origin case.

**Why:** Echoing only the already-allowlisted origin keeps the DNS-rebinding
defense intact -- a disallowed origin is rejected with 403 before any CORS header
is emitted, so the allowlist still governs access. Handling preflight is required
for the documented web-based MCP clients to connect at all, and reflecting the
specific origin (rather than `*`) is the correct, narrow choice for a
credential-free localhost transport.

**Commit:** 3365e3f -- fix(transport): address second-round Codex review feedback for PR #83
