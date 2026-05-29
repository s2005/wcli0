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

- [ ] Confirm latest SDK version exporting `StreamableHTTPServerTransport`
- [ ] Bump `@modelcontextprotocol/sdk` in `package.json`
- [ ] Run `npm install` (regenerate `package-lock.json`)
- [ ] `npm run build` clean; fix any breaking API/type changes
- [ ] Verify `server/streamableHttp.js` present in installed SDK
- [ ] `npm test` green (adjust `SseTestClient` protocolVersion only if needed)
- [ ] `npm run lint` clean

## Phase 2: Types and Configuration

- [ ] Add `'http'` to `TransportConfig.mode` in `src/types/config.ts`
- [ ] Add `httpHost`, `httpPort`, `httpAllowedOrigins` fields
- [ ] Extend `DEFAULT_CONFIG.transport` defaults
- [ ] Extend transport merge block for http fields
- [ ] Extend `applyCliTransport()` for `http` mode + http flags
- [ ] Extend `validateTransportConfig()` for http fields
- [ ] Confirm `createSerializableConfig()` copies http fields
- [ ] Unit tests for http config defaults/overrides/validation

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
