# P2 - Reject untrusted Origin headers on HTTP transport

The SSE endpoints accept every `GET /sse` and `POST /messages` without checking
the `Origin` header (`src/utils/transport.ts:14`). For the default localhost
listener, a malicious web page can use DNS rebinding to reach `127.0.0.1:9444`
with its own origin and drive the MCP command-execution tools over SSE/POST. The
MCP HTTP transport security guidance requires validating `Origin` to prevent
exactly this class of attack. Add an allowlist for local origins/hosts and reject
disallowed origins before creating sessions or handling messages, while still
permitting non-browser clients that send no `Origin` header.
