# Analysis: Streamable HTTP Transport for MCP Server

## Goal

Add the MCP Streamable HTTP transport (revision 2025-03-26) as a third transport
mode (`http`) with a single `/mcp` endpoint, stateful sessions, and per-session
working-directory isolation, while leaving the existing `stdio` and `sse`
transports unchanged. Cover it with unit and integration tests and document it.

## Current Behavior

- Transport selection lives in `CLIServer.run()` (`src/index.ts:1480`): it
  branches on `this.config.transport?.mode === 'sse'` to call `createSseServer()`,
  otherwise creates a `StdioServerTransport`. The HTTP server reference is stored
  on `this.httpServer` and closed in `cleanup()` (`src/index.ts:1445`).
- `cleanup()` pauses `process.stdin` when `mode !== 'sse'` (`src/index.ts:1464`).
  This is wrong for a future `http` mode (it would needlessly pause stdin; benign
  but should be tightened to "only in stdio mode").
- The legacy SSE transport is implemented in `src/utils/transport.ts`:
  `createSseServer(createServer, host, port, allowedOrigins)` builds an
  `http.createServer`, validates the `Origin` header via `isOriginAllowed()`
  (`src/utils/transport.ts:61`), echoes CORS headers for allowed browser origins,
  answers `OPTIONS` preflight, routes `GET /sse` (opens a stream, one server per
  connection) and `POST /messages?sessionId=…` (routes by session map), tracks
  open sockets in a `WeakMap` for forced close, and parses the request URL
  defensively (malformed `Host` returns `400`). `closeSseServer()` force-destroys
  sockets so long-lived streams do not hang shutdown.
- Per-connection server isolation already exists:
  `createServerInstance(session: SessionState)` (`src/index.ts:265`) builds a
  fully wired `Server` (low-level `new Server({...}, { capabilities })` +
  `setupHandlers`). SSE mode passes
  `() => this.createServerInstance({ activeCwd: this.primarySession.activeCwd })`
  so each connection has an isolated active working directory.
- Transport config: `TransportConfig { mode: 'stdio' | 'sse'; sseHost; ssePort;
  sseAllowedOrigins? }` (`src/types/config.ts:242`). `applyCliTransport()`
  (`src/utils/config.ts:909`) applies `--transport`, `--sse-host`, `--sse-port`,
  `--sse-allowed-origins` over the loaded config and rejects fractional ports.
  `validateTransportConfig()` (`src/utils/config.ts:600`) validates `mode`,
  `sseHost`, `ssePort` range, and `sseAllowedOrigins`. The transport is copied
  into the serializable config (review item P10).
- CLI flags are declared in `parseArgs()` (`src/index.ts:162`): `--transport`
  (choices `['stdio','sse']`), `--sse-host`, `--sse-port`, `--sse-allowed-origins`.
- SDK is pinned at `@modelcontextprotocol/sdk@1.0.1` (`package.json`). The
  installed package ships only `server/sse.js` and `server/stdio.js`; there is no
  `server/streamableHttp.js`. The server uses the low-level `Server` +
  `setRequestHandler(schema, handler)` API exclusively.

## Feasibility

Feasible, with one hard prerequisite. `StreamableHTTPServerTransport` does not
exist in SDK `1.0.1`; it was added around `1.10.0` (latest is `1.29.0`). So the
SDK must be upgraded first. The upgrade is the main source of risk because it
spans many minor versions, but the blast radius is limited: the codebase relies
on the stable low-level `Server`/`setRequestHandler` API and a small set of type
schemas (`CallToolRequestSchema`, `ListToolsRequestSchema`,
`ListResourcesRequestSchema`, `ListResourceTemplatesRequestSchema`,
`ReadResourceRequestSchema`), all of which have remained stable. Once the SDK is
upgraded, the new transport slots into the same `createServerInstance()` +
per-session-map pattern the SSE transport already uses, so the incremental design
risk is low.

## Approach

The recommended approach: **upgrade the SDK, factor the shared HTTP plumbing out
of `transport.ts` into a small `httpShared.ts`, then add a parallel
`streamableHttp.ts` module** that mirrors `createSseServer()` but serves a single
`/mcp` endpoint using `StreamableHTTPServerTransport` in stateful mode. Wire a new
`http` mode through config, CLI, and `CLIServer.run()`.

Three design decisions were considered.

### Decision A: Stateful vs stateless sessions

| Advantages (stateful, recommended) | Disadvantages (stateful) |
| ----------------------------------- | ------------------------ |
| Preserves per-session active-directory isolation already built for SSE | Requires a session map and disconnect cleanup (already solved for SSE) |
| Matches the SSE mental model and reuses `createServerInstance(session)` | Slightly more code than stateless |
| Spec-compliant `Mcp-Session-Id` lifecycle, supports `DELETE` termination | Must avoid the disconnect-during-connect leak (known fix exists) |

Stateless mode (`sessionIdGenerator: undefined`) is simpler but shares one server
across requests, which would break the working-directory isolation the project
deliberately implemented. Rejected; see Non-Requirements in the PRD.

### Decision B: Separate `http` mode vs dual-endpoint bridge

| Advantages (separate mode, recommended) | Disadvantages (separate mode) |
| ---------------------------------------- | ----------------------------- |
| Smallest change; `--transport` stays a simple enum | Clients must pick the right mode; no automatic fallback |
| No interaction between legacy and new routing | A future bridge would be a separate task |
| Easy to test each transport in isolation | -- |

A single server mounting both `/sse` and `/mcp` (the SDK "backwards compatible"
example) maximizes client compatibility but doubles the surface and the testing
matrix. Out of scope for this task.

### Decision C: Config field naming

| Advantages (new `http*` fields, recommended) | Disadvantages (new `http*` fields) |
| --------------------------------------------- | ---------------------------------- |
| Clear semantics in config files (`httpHost` for `http` mode) | Mild duplication with `sse*` fields |
| No behavioral coupling between modes | Two near-identical validation blocks |
| Backward compatible (no migration of existing configs) | -- |

The alternative -- reusing `sseHost`/`ssePort`/`sseAllowedOrigins` as shared
"HTTP bind" settings -- avoids duplication but is confusing to read in a config
file for `http` mode and couples the two transports. Rejected in favor of
explicit `httpHost` / `httpPort` / `httpAllowedOrigins`, defaulting to
`127.0.0.1` / `9444` / `[]`.

## Implementation Notes

- **Transport value name.** `--transport http` selects Streamable HTTP. Document
  prominently that `http` = Streamable HTTP (2025-03-26) and `sse` = legacy
  HTTP+SSE (2024-11-05), since both run over HTTP.
- **Session creation.** On a `POST /mcp` that carries no `Mcp-Session-Id` and is
  an `initialize` request, construct
  `new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(),
  onsessioninitialized: (id) => sessions.set(id, { transport, server }) })`,
  build a fresh server via the injected factory, `await server.connect(transport)`,
  then `await transport.handleRequest(req, res, parsedBody)`. Register the
  session-removal listener on `res`/transport `onclose` *before* `connect()` to
  avoid the disconnect-during-connect leak (mirror the SSE fix documented in the
  `http_sse_transport` task).
- **Routing existing sessions.** For requests with a known `Mcp-Session-Id`, look
  up the stored transport and call `handleRequest(req, res, parsedBody)`; the SDK
  transport handles GET (stream), POST (messages), and DELETE (termination)
  semantics internally based on method.
- **Body parsing.** For `POST`, read the request body and `JSON.parse` it, then
  pass it as the third argument to `handleRequest()` (the common SDK pattern), so
  the initialize-detection branch can inspect it. Guard parse errors with a `400`.
- **Shared helpers.** Extract `isOriginAllowed`, `corsOriginToEcho`, the
  socket-tracking `WeakMap`, and the force-close logic into
  `src/utils/httpShared.ts`. Refactor `transport.ts` to import them (behavior
  unchanged) and have `streamableHttp.ts` reuse them. Provide a generic
  `closeHttpServer(server)` (the current `closeSseServer` logic) used by both;
  keep `closeSseServer` as a thin re-export to avoid touching call sites, or
  update the single call site in `index.ts`.
- **CLIServer wiring.** Add a `mode === 'http'` branch in `run()` that calls
  `createStreamableHttpServer(() => this.createServerInstance({ activeCwd:
  this.primarySession.activeCwd }), host, port, allowedOrigins)` and stores
  `this.httpServer`. Update the `cleanup()` stdin condition to pause stdin only in
  stdio mode (`mode !== 'sse' && mode !== 'http'`, or `mode === 'stdio'`).
- **Protocol version.** Integration tests must initialize with `protocolVersion
  '2025-03-26'` (or later) for the Streamable HTTP client; the SDK negotiates the
  version and assigns the session id on the initialize response headers.
- **Test client.** `StreamableHttpTestClient` differs from `SseTestClient`: it
  sends `POST /mcp` with `Accept: application/json, text/event-stream`, captures
  the `Mcp-Session-Id` response header, and parses either a JSON body or an SSE
  `message` event depending on the server's chosen response content type.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| SDK upgrade (1.0.1 to 1.29.0) introduces breaking API/type changes | Phase 1 upgrades and runs full `npm test` + `npm run lint` before any new code; fix drift in isolation, commit separately |
| SDK upgrade changes default protocol version / handshake behavior, breaking existing SSE tests | Re-run SSE integration suite in Phase 1; pin client `protocolVersion` in tests; adjust `SseTestClient` if needed |
| Session map leak on disconnect-during-connect (the SSE-era bug) | Register cleanup on `res`/`onclose` before `connect()`; add an edge-case test that opens and immediately aborts a stream |
| Long-lived `/mcp` streams hang graceful shutdown | Reuse socket-tracking + `closeAllConnections`/`destroy` logic from `httpShared.ts`; assert port released after `cleanup()` |
| Body double-read (consuming the stream before `handleRequest`) | Read body once, pass parsed JSON to `handleRequest`; never pipe the raw stream first |
| `randomUUID` import differences across Node versions | Use `node:crypto` `randomUUID` (available on supported Node 18+) |
| Naming confusion between `sse` and `http` (both HTTP) | Explicit docs + distinct config fields; transport reported in `get_config` |

## Test Strategy

- **Unit (`tests/unit/streamableHttp.test.ts`)**: `http` mode config defaults,
  `applyCliTransport()` applying `--transport http` / `--http-host` /
  `--http-port` / `--http-allowed-origins` and rejecting fractional ports,
  `validateTransportConfig()` accepting `http` and validating fields, and
  `isOriginAllowed()` behavior via the shared module. CLI parse tests for the new
  flags (extend the existing parseArgs unit coverage).
- **Integration (`tests/integration/streamable-http-*.test.ts`)** via a new
  `StreamableHttpTestClient` on an ephemeral port (`httpPort: 0`):
  - Handshake + lifecycle: initialize over `POST /mcp`, receive `Mcp-Session-Id`,
    `tools/list`, clean shutdown, port released.
  - Tool execution: `execute_command` returns output; honors per-call options.
  - Resources: `resources/list`, `resources/read` (`cli://config`, logs).
  - Security: untrusted origin `403`, no-origin allowed, configured origin + CORS,
    `OPTIONS` preflight `204`, malformed `Host` `400` without crash.
  - Sessions: two isolated sessions (working-directory isolation), unknown
    session `404`, `DELETE /mcp` terminates a session, malformed JSON body `400`.
- **Regression**: full `npm test` (stdio + legacy SSE suites remain green), and
  `npm run lint`. Confirm no "worker process failed to exit gracefully" warning.
