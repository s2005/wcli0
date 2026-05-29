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

- [ ] Add `'http'` to `--transport` choices in `parseArgs()`
- [ ] Add `--http-host`, `--http-port`, `--http-allowed-origins` flags
- [ ] Pass new args into `applyCliTransport()` in `main()`
- [ ] Unit tests for CLI parsing of new flags

## Phase 4: Shared HTTP Module and Streamable HTTP Transport

- [ ] Create `src/utils/httpShared.ts` (origin/CORS/socket/close helpers)
- [ ] Refactor `src/utils/transport.ts` to use `httpShared` (no behavior change)
- [ ] Create `src/utils/streamableHttp.ts` with `createStreamableHttpServer()`
- [ ] Implement `/mcp` POST/GET/DELETE routing and session map
- [ ] Implement new-session creation (sessionIdGenerator + factory + connect)
- [ ] Register session cleanup before `connect()` (disconnect-during-connect)
- [ ] Use `randomUUID` from `node:crypto`
- [ ] Unit tests for shared module + 403 origin path

## Phase 5: CLIServer Integration

- [ ] Add `mode === 'http'` branch in `CLIServer.run()`
- [ ] Store `this.httpServer`; emit debug bind log
- [ ] Update `cleanup()` stdin-pause guard (stdio only)
- [ ] Manual smoke: `node dist/index.js --transport http --debug`

## Phase 6: Integration Tests

- [ ] Create `tests/helpers/StreamableHttpTestClient.ts`
- [ ] `streamable-http-transport.test.ts` (handshake, lifecycle, port released)
- [ ] `streamable-http-tool-execution.test.ts` (tools + per-call options)
- [ ] `streamable-http-resources.test.ts` (resources/list + read)
- [ ] `streamable-http-security.test.ts` (origin/CORS/Host)
- [ ] `streamable-http-sessions.test.ts` (isolation, unknown session, DELETE, edge cases)
- [ ] Full regression: `npm test` green, no worker warnings

## Phase 7: Documentation

- [ ] Document `http` mode and `/mcp` semantics in `README.md`
- [ ] Document `--http-host` / `--http-port` / `--http-allowed-origins` flags
- [ ] Document `transport` config fields and security guidance
- [ ] Markdown lint clean

## Review Feedback

(Section to be populated when PR review feedback arrives.)
