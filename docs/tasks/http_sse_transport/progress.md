# Progress: HTTP/SSE Transport for MCP Server

## Status Legend

| Marker | Meaning                   |
| ------ | ------------------------- |
| `[ ]`  | Not started               |
| `[x]`  | Complete                  |
| `[~]`  | In progress               |
| `[!]`  | Blocked or needs decision |
| `[-]`  | Skipped / not applicable  |

## Planning Checklist

- [x] Analyze current behavior.
- [x] Create analysis.md
- [x] Create PRD.md
- [x] Create implementation_plan.md
- [x] Create verification.md
- [x] Create progress.md

## Phase 1: Types and Configuration

- [x] Add `TransportConfig` interface to `src/types/config.ts`
- [x] Add `transport` field to `ServerConfig`
- [x] Add default transport config to `DEFAULT_CONFIG` in `src/utils/config.ts`
- [x] Add `applyCliTransport()` function in `src/utils/config.ts`
- [x] Load transport section from config file
- [x] Write unit tests for transport config defaults and overrides

## Phase 2: CLI Arguments

- [x] Add `--transport` flag to `parseArgs()` in `src/index.ts`
- [x] Add `--sse-host` flag to `parseArgs()`
- [x] Add `--sse-port` flag to `parseArgs()`
- [x] Call `applyCliTransport()` in `main()` function
- [x] Write unit tests for CLI argument parsing

## Phase 3: SSE Transport Module

- [x] Create `src/utils/transport.ts`
- [x] Implement `createSseServer()` function
- [x] Implement SSE connection handling (GET `/sse`)
- [x] Implement message routing (POST `/messages`)
- [x] Implement `closeSseServer()` helper
- [x] Write unit tests for transport module

## Phase 4: CLIServer Integration

- [x] Update `CLIServer.run()` to support both transports
- [x] Store HTTP server reference for cleanup
- [x] Update cleanup handler for SSE mode
- [x] Write integration tests for SSE transport
- [x] Write regression tests for stdio transport

## Phase 5: Documentation

- [x] Update README.md with transport CLI flags
- [x] Add config file transport section example
- [x] Add SSE usage example

## Phase 6: Integration Test Coverage (Test Implementation Plan)

See [test-implementation-plan.md](test-implementation-plan.md) for full details.

- [x] Phase 6a: Create `SseTestClient` helper in `tests/helpers/SseTestClient.ts`
- [x] Phase 6b: Add tool execution tests over SSE (`sse-tool-execution.test.ts`) -- 11 test cases
- [x] Phase 6c: Add security scenario tests over SSE (`sse-security.test.ts`) -- 11 test cases
- [x] Phase 6d: Add stdio protocol handshake tests (update `mcpProtocol.test.ts`) -- 5 test cases
- [x] Phase 6e: Refactor existing SSE tests to use `SseTestClient` helper
- [x] Run full regression: `npm test`

## Phase 7: Worker Exit Warning

See [worker-exit-investigation.md](worker-exit-investigation.md) for full details.

- [x] Verify SIGINT handler leak fix is implemented (`src/index.ts`)
- [x] Reproduce the `worker process has failed to exit gracefully` warning
- [x] Bisect the warning to `tests/integration/sse-transport.test.ts`
- [x] Identify the root cause: stdio transport leaves `process.stdin` flowing/referenced
- [x] Add `server.closeAllConnections()` to `closeSseServer()` (production shutdown fix)
- [x] Fix `CLIServer.cleanup()` to close the MCP transport and pause `process.stdin`
- [x] Document findings in `worker-exit-investigation.md`
- [x] Re-run full regression in parallel: 900 passed, 0 warnings, ~17s (3 runs)

## Phase 8: Close Remaining Coverage Gaps

See [test-coverage-comparison.md](test-coverage-comparison.md) "Gaps in HTTP/SSE Test
Coverage". Gaps 1-3 (and partial 7) were closed in Phase 6. The remaining gaps are
closed here so both transports are fully exercised.

### Phase 8a: Resource handler coverage (gap #4)

- [x] Create `tests/integration/sse-resources.test.ts` (resources over SSE) -- 7 test cases
- [x] Add stdio resource handler tests to `tests/integration/mcpProtocol.test.ts` -- 4 test cases

### Phase 8b: SSE edge-case coverage (gaps #5, #6, #7, #8)

- [x] Same-session concurrent requests (gap #5) -- `sse-edge-cases.test.ts`
- [x] SSE disconnection / reconnection (gap #6) -- `sse-edge-cases.test.ts`
- [x] Large response over SSE (gap #7) -- `sse-edge-cases.test.ts`
- [x] Malformed JSON-RPC over SSE (gap #8) -- `sse-edge-cases.test.ts`
- [x] Fix production bug surfaced by gap #6: `mcpServer.connect()` overwrote
      `transport.onclose`, so disconnected sessions were never removed from the
      session map (leak; POST to a dead session returned 500 instead of 404).
      Fixed in `src/utils/transport.ts` by registering cleanup after connect().
      See [session-leak-on-disconnect.md](session-leak-on-disconnect.md).

### Phase 8c: Documentation sync

- [x] Update `test-coverage-comparison.md` to reflect closed gaps
- [x] Update `verification.md` final acceptance checklist
- [x] Run full regression: 918 passed, 24 skipped, 0 failed, no worker warnings

## Review Feedback (PR #83)

- [x] P1: Create a fresh MCP server per SSE session (fixed -- `createSseServer()`
      now takes a `() => Server` factory; `CLIServer.createServerInstance()`
      builds one wired server per `GET /sse`, so each session owns its transport)
- [x] P2: Reject untrusted Origin headers (fixed -- added `isOriginAllowed()` and
      a 403 on disallowed origins for `GET /sse` and `POST /messages`; no-Origin
      and loopback/bind-host origins still pass)
- [x] P3: Avoid advertising unauthenticated bind-all example (fixed -- README
      example now binds `127.0.0.1`; added a prominent security warning about
      `0.0.0.0`)
- [x] P4: Validate transport config before use (fixed -- `validateConfig()` now
      calls `validateTransportConfig()` checking `mode`, `sseHost`, and the
      `1..65535` port range)

### Second review round

- [x] P5: Handle malformed Host headers (fixed -- the request URL is now parsed
      in a `try/catch` that returns 400, so a bad `Host` like `%%%%` no longer
      crashes the server via an unhandled rejection)
- [x] P6: Track sockets instead of relying on closeAllConnections (fixed --
      `createSseServer()` tracks accepted sockets in a per-server `WeakMap` set;
      `closeSseServer()` destroys them when `closeAllConnections` is missing on
      Node 18.0/18.1)
- [x] P7: Isolate active directories per SSE session (fixed -- introduced a
      per-session `SessionState`; `_executeTool(params, session)` reads/writes
      `session.activeCwd`, and each SSE connection gets its own state seeded from
      the primary session)
- [x] P8: Return CORS headers for allowed browser origins (fixed -- allowed
      origins are echoed via `Access-Control-Allow-Origin`/`Vary`, and `OPTIONS`
      preflight requests are answered with 204)

### Third review round

- [x] P9: Reject fractional SSE ports from the CLI (fixed -- `applyCliTransport()`
      now requires `Number.isInteger(ssePort)`, so `--sse-port 9444.5` is warned
      about and ignored instead of crashing `httpServer.listen()` with
      `ERR_SOCKET_BAD_PORT`)
- [x] P10: Include transport in serialized config (fixed --
      `createSerializableConfig()` now copies `config.transport` when present, so
      `get_config` and `cli://config` report the active mode/host/port)

### Fourth review round

- [x] P11: Avoid changing global cwd for per-session SSE directories (fixed --
      `execute_command` now anchors a relative `workingDir` to the calling
      session's `activeCwd` via `resolveWorkingDirForSession()`, so it no longer
      resolves against the shared process cwd that another session changed)
- [x] P12: Allow origins for wildcard SSE binds (fixed -- added
      `transport.sseAllowedOrigins` config + `--sse-allowed-origins` CLI flag;
      `isOriginAllowed()` accepts configured origins in addition to loopback and
      the bind host, enabling browser clients on a `0.0.0.0` bind)
- [x] P13: Register SSE cleanup before the connection can close (fixed -- the
      session-cleanup listener is registered on `res.on('close')` before
      `connect()`, eliminating the disconnect-during-connect race that leaked
      session entries and turned later POSTs into 500s instead of 404s)
