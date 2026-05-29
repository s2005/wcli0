# Progress: Streamable HTTP Transport for MCP Server

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

## Phase 1: SDK Upgrade and Regression

- [x] Confirm latest SDK version exporting `StreamableHTTPServerTransport`
- [x] Bump `@modelcontextprotocol/sdk` in `package.json`
- [x] Run `npm install` (regenerate `package-lock.json`)
- [x] `npm run build` clean; fix any breaking API/type changes
- [x] Verify `server/streamableHttp.js` present in installed SDK
- [x] `npm test` green (adjust `SseTestClient` protocolVersion only if needed)
- [x] `npm run lint` clean

### Phase 1 Notes

- SDK upgraded `1.0.1` -> `1.29.0` (latest stable; exports `StreamableHTTPServerTransport`).
- SDK 1.29.0 imports `zod/v4` internally. Fixed one type error in `src/index.ts`
  by typing `_executeTool(toolParams)` via the SDK's exported `CallToolRequest['params']`
  instead of the project's v3 `z.infer<typeof CallToolRequestSchema>['params']`.
- Corrected stale `@modelcontextprotocol/sdk/dist/*` subpaths in
  `tests/helpers/InMemoryTransport.ts` to the modern `shared/transport.js` / `types.js`
  export-map subpaths.
- No `SseTestClient` protocolVersion change needed; SSE suite remained green.

## Phase 2: Types and Configuration

- [x] Add `'http'` to `TransportConfig.mode` in `src/types/config.ts`
- [x] Add `httpHost`, `httpPort`, `httpAllowedOrigins` fields
- [x] Extend `DEFAULT_CONFIG.transport` defaults
- [x] Extend transport merge block for http fields
- [x] Extend `applyCliTransport()` for `http` mode + http flags
- [x] Extend `validateTransportConfig()` for http fields
- [x] Confirm `createSerializableConfig()` copies http fields
- [x] Unit tests for http config defaults/overrides/validation

### Phase 2 Notes

- Merge block already spread-merges `transport`, so file-provided http fields
  survive automatically once defaults include them; no merge-code change needed.
- `applyCliTransport()` gained three trailing positional params
  (`httpHost`, `httpPort`, `httpAllowedOrigins`) so existing 5-arg callers and
  tests are unaffected.
- `createSerializableConfig()` now reports `httpHost`/`httpPort` alongside
  `sseHost`/`ssePort`; Jest `toEqual` ignores undefined fields so the existing
  P10 getConfig test still passes for sse-only configs.
- Updated two pre-existing tests whose contract changed: `configValidation`
  "invalid mode" now uses `websocket` (http is valid) and asserts the new
  message; `transport.test.ts` full-object `toEqual`s include the http defaults.

## Phase 3: CLI Arguments

- [x] Add `'http'` to `--transport` choices in `parseArgs()`
- [x] Add `--http-host`, `--http-port`, `--http-allowed-origins` flags
- [x] Pass new args into `applyCliTransport()` in `main()`
- [x] Unit tests for CLI parsing of new flags

### Phase 3 Notes

- `parseArgs()` is a private const (not exported); CLI parse tests mirror its
  transport-related yargs option declarations in a `parseTransportArgs` helper
  in `tests/unit/streamableHttp.test.ts`, matching the existing `transport.test.ts`
  pattern. Kept in sync with the real option list in `src/index.ts`.
- `--transport` choices are now `['stdio', 'sse', 'http']`; an invalid value is
  rejected by yargs (asserted via the throw path with `exitProcess(false)`).

## Phase 4: Shared HTTP Module and Streamable HTTP Transport

- [x] Create `src/utils/httpShared.ts` (origin/CORS/socket/close helpers)
- [x] Refactor `src/utils/transport.ts` to use `httpShared` (no behavior change)
- [x] Create `src/utils/streamableHttp.ts` with `createStreamableHttpServer()`
- [x] Implement `/mcp` POST/GET/DELETE routing and session map
- [x] Implement new-session creation (sessionIdGenerator + factory + connect)
- [x] Register session cleanup before `connect()` (disconnect-during-connect)
- [x] Use `randomUUID` from `node:crypto`
- [x] Unit tests for shared module + 403 origin path

### Phase 4 Notes

- `httpShared.ts` exports `isOriginAllowed`, `corsOriginToEcho`, `trackSockets`,
  `closeHttpServer`; `parseAllowedOriginHost`/`LOOPBACK_HOSTS` stay private.
- `transport.ts` now imports those helpers and keeps `isOriginAllowed`
  (re-export of the imported binding) and `closeSseServer` (thin wrapper over
  `closeHttpServer`) so existing importers/tests are unchanged. SSE integration
  suite (46 tests) still green -> behavior preserved.
- The SDK's built-in DNS-rebinding options (`allowedHosts`/`allowedOrigins`/
  `enableDnsRebindingProtection`) are deprecated in favor of external
  middleware, so the `/mcp` handler does its own origin check via `httpShared`,
  matching SSE and keeping one implementation.
- Body is read once (`readJsonBody`, 4 MB guard) and passed to
  `handleRequest(req, res, body)` as the SDK's pre-parsed-body pattern; GET/DELETE
  call `handleRequest(req, res)`. Unknown session -> 404; non-initialize without
  session -> 400; invalid JSON -> 400; unsupported method on `/mcp` -> 405.
- Unit tests added: shared `isOriginAllowed` parity, plus a live server
  asserting listen, 403 hostile origin (factory never runs), 404 unknown path,
  400 bad JSON, 404 unknown GET session, 204 OPTIONS preflight + CORS.

## Phase 5: CLIServer Integration

- [x] Add `mode === 'http'` branch in `CLIServer.run()`
- [x] Store `this.httpServer`; emit debug bind log
- [x] Update `cleanup()` stdin-pause guard (stdio only)
- [x] Manual smoke: `node dist/index.js --transport http --debug`

### Phase 5 Notes

- `run()` now branches sse / http / stdio. The http branch resolves
  `httpHost`/`httpPort`/`httpAllowedOrigins` and calls
  `createStreamableHttpServer(() => createServerInstance(...))`, storing
  `this.httpServer` and logging the `/mcp` bind address.
- `cleanup()` pauses stdin only when mode is neither `sse` nor `http` (i.e.
  stdio), and now closes `this.httpServer` via the shared `closeHttpServer()`
  (serves both HTTP transports).
- Manual smoke on `--transport http --http-port 9555 --debug`: bind log shown;
  `POST /mcp` initialize -> 200 with `Mcp-Session-Id` and protocolVersion
  2025-03-26; unknown path -> 404; `OPTIONS` preflight -> 204 with CORS.

## Phase 6: Integration Tests

- [x] Create `tests/helpers/StreamableHttpTestClient.ts`
- [x] `streamable-http-transport.test.ts` (handshake, lifecycle, port released)
- [x] `streamable-http-tool-execution.test.ts` (tools + per-call options)
- [x] `streamable-http-resources.test.ts` (resources/list + read)
- [x] `streamable-http-security.test.ts` (origin/CORS/Host)
- [x] `streamable-http-sessions.test.ts` (isolation, unknown session, DELETE, edge cases)
- [x] Full regression: `npm test` green, no worker warnings

### Phase 6 Notes

- `StreamableHttpTestClient` starts a CLIServer in http mode on `httpPort: 0`,
  mirrors the SSE client's WSL-emulator setup, performs the initialize handshake
  (Accept: application/json, text/event-stream), captures `Mcp-Session-Id`, and
  parses JSON-or-SSE responses. Exposes `call`/`callTool`/`terminate`/`close`
  plus a standalone `mcpHttpRequest` for raw requests.
- Verified per-session isolation by opening TWO sessions on ONE server (not two
  servers): `set_current_directory` on session 1 moves only session 1's
  `activeCwd`; session 2 stays at the initial dir. The handler also calls
  `process.chdir()` (process-global, pre-existing), so the test captures the
  original cwd up front and restores it in `afterEach` to avoid polluting the
  WSL-emulator path resolution for later tests in the worker.
- Security: untrusted origin 403, no-origin 200, loopback + configured origin
  CORS echo, OPTIONS 204 (and 403 for hostile origin), malformed Host 400 via a
  raw TCP socket (the http client rejects bad Host before sending).
- Sessions: unknown session 404, DELETE terminates (2xx) then later 404,
  malformed JSON 400 with session still usable, rapid initialize-and-abort does
  not wedge the server.
- Full suite: 1047 passed / 24 skipped, no worker-exit warning.

## Phase 7: Documentation

- [ ] Document `http` mode and `/mcp` semantics in `README.md`
- [ ] Document `--http-host` / `--http-port` / `--http-allowed-origins` flags
- [ ] Document `transport` config fields and security guidance
- [ ] Markdown lint clean

## Review Feedback

(Section to be populated when PR review feedback arrives.)
