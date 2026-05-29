# PRD: Streamable HTTP Transport for MCP Server

## Objective

Add the modern MCP **Streamable HTTP** transport (protocol revision 2025-03-26)
to the wcli0 MCP server, exposed as a third transport mode (`http`) alongside the
existing `stdio` and `sse` modes. The transport serves a single `/mcp` endpoint
that handles client-to-server messages (`POST`), an optional server-to-client SSE
stream (`GET`), and session termination (`DELETE`), with stateful session
management and per-session working-directory isolation. Existing stdio and
legacy HTTP+SSE behavior must remain unchanged.

## Background

The server currently supports two transports: `stdio` (default) and the legacy
**HTTP+SSE** transport (protocol revision 2024-11-05), implemented in
`src/utils/transport.ts` via the SDK's `SSEServerTransport`. The HTTP+SSE
transport uses two endpoints (`GET /sse` for the stream, `POST /messages` for
requests).

The MCP specification superseded HTTP+SSE with the **Streamable HTTP** transport
in revision 2025-03-26. It collapses to a single endpoint (conventionally
`/mcp`), negotiates a session via the `Mcp-Session-Id` header, lets the server
answer a `POST` with either a single JSON response or an SSE stream, and supports
explicit session termination via `DELETE`. Modern MCP clients increasingly
default to Streamable HTTP, and the legacy SSE transport is deprecated in the
spec.

A hard prerequisite: the pinned SDK `@modelcontextprotocol/sdk@1.0.1` does not
ship `StreamableHTTPServerTransport`. That class was introduced in a later SDK
release (~1.10.0); the current latest is `1.29.0`. Implementing this feature
therefore requires upgrading the SDK and re-validating the whole test suite.
The server uses the stable low-level `Server` + `setRequestHandler(schema,
handler)` API (`src/index.ts`), which limits the upgrade blast radius, but a full
regression pass is mandatory.

The per-session design groundwork already exists: `createServerInstance(session)`
builds a fully wired `Server` with its own `SessionState` (active working
directory), and SSE mode already creates one server per connection. Streamable
HTTP can reuse this pattern directly to keep client sessions isolated.

## Requirements

### REQ-1: SDK upgrade enabling Streamable HTTP

Upgrade `@modelcontextprotocol/sdk` from `1.0.1` to a version that exports
`StreamableHTTPServerTransport` (target: the latest stable, currently `1.29.0`).
After the upgrade, `npm run lint` and the full `npm test` suite must pass with no
regressions and no new open-handle/worker warnings. Any breaking API or type
changes surfaced by the upgrade are fixed as part of this requirement.

### REQ-2: New `http` transport mode

The server must accept `--transport http` and `transport.mode: "http"` in the
config file, selecting the Streamable HTTP transport. The existing `stdio` and
`sse` values must continue to work unchanged. The `mode` union becomes
`'stdio' | 'sse' | 'http'`. The CLI `--transport` choices list must include
`http`, and any other value is rejected.

### REQ-3: Single `/mcp` endpoint with POST, GET, DELETE

When running in `http` mode the server must:

- Create an `http.createServer` instance bound to the configured host/port.
- Route `POST /mcp` to `StreamableHTTPServerTransport.handleRequest()` with the
  parsed JSON-RPC body (client-to-server messages, including `initialize`).
- Route `GET /mcp` to the transport (server-to-client SSE stream for
  notifications/requests).
- Route `DELETE /mcp` to the transport for explicit session termination.
- Return `404` for any other path and `405`/appropriate status for unsupported
  methods on `/mcp`, consistent with the SDK transport's expectations.
- Log the bind address and port on startup (via debug logging, matching SSE).

### REQ-4: Stateful sessions with per-session isolation

Sessions must be stateful, keyed by the `Mcp-Session-Id` header:

- An `initialize` `POST` with no session id creates a new transport configured
  with `sessionIdGenerator` (a UUID generator) and a fresh server instance built
  via `createServerInstance({ activeCwd: primarySession.activeCwd })`, so one
  client's `set_current_directory` cannot affect another client.
- The assigned session id is captured (`onsessioninitialized`) and stored in a
  `Map<string, { transport, server }>`.
- Subsequent requests carrying a valid `Mcp-Session-Id` route to the stored
  transport; an unknown/expired session id returns the SDK-appropriate error
  (HTTP `404`).
- Session entries are removed when the transport closes or a `DELETE` terminates
  the session, with cleanup registered before the connection can close (to avoid
  the disconnect-during-connect leak previously fixed for SSE; see the existing
  `session-leak-on-disconnect.md` in the `http_sse_transport` task).

### REQ-5: HTTP bind configuration

The server must accept `--http-host` (default `127.0.0.1`) and `--http-port`
(default `9444`) CLI flags and matching `transport.httpHost` / `transport.httpPort`
config fields. Only applies in `http` mode. `httpPort` must be an integer in
`1..65535`; invalid values are warned about and ignored (CLI) or rejected
(config validation), mirroring the existing `ssePort` handling.

### REQ-6: Origin validation, CORS, and allowed origins

The Streamable HTTP server must apply the same DNS-rebinding defense as SSE:

- Requests with an `Origin` header that is not loopback, the bind host, or a
  configured allowed origin are rejected with `403`.
- Requests with no `Origin` (non-browser clients) are allowed.
- Allowed origins are configurable via `--http-allowed-origins` (comma-separated)
  and `transport.httpAllowedOrigins` (array). For allowed browser origins, CORS
  headers (`Access-Control-Allow-Origin`, `Vary: Origin`) are echoed and `OPTIONS`
  preflight is answered with `204`.
- A malformed `Host` header returns `400` and must not crash the process.

The shared origin/CORS/socket-tracking logic is factored out of
`src/utils/transport.ts` so both transports use one implementation.

### REQ-7: Config precedence, validation, and reporting

- CLI flags override config-file values for all transport settings.
- `validateTransportConfig()` accepts `mode: "http"` and validates `httpHost`,
  `httpPort`, and `httpAllowedOrigins`.
- The active transport (mode/host/port) is included in the serialized config
  returned by the `get_config` tool and the `cli://config` resource.

### REQ-8: Lifecycle and backward compatibility

- Graceful shutdown (`SIGINT`) closes the HTTP server, terminates all active
  sessions/streams, and releases the port (reusing the socket-tracking close
  logic so long-lived streams do not hang shutdown).
- `stdin` is paused only in `stdio` mode (the current `cleanup()` condition must
  be updated so `http` mode is treated like `sse`).
- Running `npx wcli0` with no flags still starts stdio; `--transport sse` still
  starts the legacy transport unchanged.

### REQ-9: Tests

New transport code must be covered by unit and integration tests:

- Unit tests: `http` mode config defaults/overrides, `applyCliTransport()` http
  flags, `validateTransportConfig()` http validation, CLI arg parsing of
  `--transport http`, `--http-host`, `--http-port`, `--http-allowed-origins`.
- Integration tests over Streamable HTTP: initialize handshake, `tools/list`,
  `tools/call` (`execute_command`), `resources/list` + `resources/read`, origin
  rejection/allow, CORS preflight, session routing (unknown session), session
  termination via `DELETE`, malformed body/Host handling.
- Regression: stdio and legacy SSE integration tests remain green.

### REQ-10: Documentation

Update `README.md` to document the `http` transport mode, the `--http-host` /
`--http-port` / `--http-allowed-origins` flags, the `transport` config fields,
the `/mcp` endpoint semantics, the relationship to (and deprecation of) the
legacy `sse` mode, and the security guidance (loopback default, origin
validation, no built-in auth).

## Non-Requirements

- Running the legacy SSE (`/sse`) and Streamable HTTP (`/mcp`) endpoints on the
  same server simultaneously (a backwards-compatible dual-endpoint bridge) is out
  of scope; modes remain mutually exclusive via `--transport`.
- Removing or deprecating the existing `sse` transport in code is out of scope.
- Authentication, OAuth, API keys, or TLS/SSL for the HTTP server is out of scope.
- Resumability via an event store / `Last-Event-ID` replay is out of scope.
- Stateless Streamable HTTP mode (no session id) is out of scope; sessions are
  always stateful to preserve per-session isolation.
- Docker or deployment configuration changes are out of scope.

## Acceptance Criteria

1. `@modelcontextprotocol/sdk` is upgraded to a version exporting
   `StreamableHTTPServerTransport`; `npm run lint` and `npm test` pass with no
   regressions.
2. `npx wcli0 --transport http` starts an HTTP server on `127.0.0.1:9444` serving
   `/mcp`, and logs the bind address/port (with `--debug`).
3. `npx wcli0 --transport http --http-host 127.0.0.1 --http-port 3000` binds to
   `127.0.0.1:3000`.
4. A Streamable HTTP MCP client can `POST /mcp` an `initialize` request, receive a
   session id via `Mcp-Session-Id`, and complete `tools/list`, `tools/call`, and
   `resources/read` exchanges.
5. Two concurrent sessions have isolated active working directories.
6. `DELETE /mcp` with a valid session id terminates that session; later requests
   for it return `404`.
7. A request with an untrusted `Origin` is rejected with `403`; a no-origin
   request is allowed; a configured allowed origin is admitted with CORS headers.
8. A malformed `Host` header returns `400` and the server stays alive.
9. The `transport` config section is respected from the config file and overridden
   by CLI flags; `get_config` and `cli://config` report the active transport.
10. `SIGINT` shuts the server down cleanly and releases the port even with an open
    `/mcp` stream.
11. `npx wcli0` (no flags) still starts stdio and `--transport sse` still starts
    the legacy transport, both unchanged.
12. New transport code has unit and integration test coverage.

## Deliverables

| Deliverable | Type |
| ----------- | ---- |
| `package.json` (SDK version bump) | Update |
| `package-lock.json` | Update |
| `src/types/config.ts` (mode union, `httpHost`/`httpPort`/`httpAllowedOrigins`) | Update |
| `src/utils/config.ts` (defaults, merge, `applyCliTransport`, `validateTransportConfig`, serialization) | Update |
| `src/utils/httpShared.ts` (extracted origin/CORS/socket/close helpers) | Create |
| `src/utils/transport.ts` (refactor to use `httpShared`) | Update |
| `src/utils/streamableHttp.ts` (`createStreamableHttpServer`, session routing) | Create |
| `src/index.ts` (CLI flags, `run()` http branch, `cleanup()` update) | Update |
| `tests/unit/streamableHttp.test.ts` (config/CLI/validation unit tests) | Create |
| `tests/helpers/StreamableHttpTestClient.ts` (integration client helper) | Create |
| `tests/integration/streamable-http-transport.test.ts` (handshake, lifecycle) | Create |
| `tests/integration/streamable-http-tool-execution.test.ts` (tools) | Create |
| `tests/integration/streamable-http-resources.test.ts` (resources) | Create |
| `tests/integration/streamable-http-security.test.ts` (origin/CORS) | Create |
| `tests/integration/streamable-http-sessions.test.ts` (sessions, DELETE, edge cases) | Create |
| `README.md` (document `http` mode and flags) | Update |
