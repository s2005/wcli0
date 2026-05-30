# Verification Plan: Streamable HTTP Transport for MCP Server

## Purpose

Verify that the MCP Streamable HTTP transport (revision 2025-03-26) is correctly
added as a third transport mode (`http`) with a single `/mcp` endpoint, stateful
sessions, per-session working-directory isolation, origin/CORS security, clean
shutdown, and config/CLI plumbing -- without regressing the existing `stdio` and
`sse` transports. Covers the SDK upgrade prerequisite and full test coverage.

## Pre-Implementation Verification

### Existing Tests Pass

```bash
npm test
```

Expected: all pass (baseline before the SDK upgrade).

### Linter Clean

```bash
npm run lint
```

Expected: no errors (`tsc --noEmit`).

### SDK Baseline

```bash
node -e "console.log(require('@modelcontextprotocol/sdk/package.json').version)"
npm view @modelcontextprotocol/sdk version
```

Expected: installed shows `1.0.1`; registry shows the latest target (e.g.
`1.29.0`). Confirms the upgrade is needed.

### Coverage Baseline (Before)

| Module | Baseline Coverage | After Coverage | Delta |
| ------ | ----------------- | -------------- | ----- |
| src/index.ts | -- % | -- % | -- % |
| src/utils/config.ts | -- % | -- % | -- % |
| src/utils/transport.ts | -- % | -- % | -- % |
| src/utils/httpShared.ts | N/A (new) | -- % | N/A |
| src/utils/streamableHttp.ts | N/A (new) | -- % | N/A |

## Post-Implementation Verification

### Phase 1 Verification: SDK Upgrade

```bash
npm install
npm run build
npm run lint
npm test
node -e "require('@modelcontextprotocol/sdk/server/streamableHttp.js'); console.log('present')"
```

Expected: build and lint clean, full suite green with no worker-exit warning, the
require prints `present`.

### Phase 2 Verification: Types and Configuration

```bash
npm test -- tests/unit/streamableHttp.test.ts
```

Expected:

- `http` transport defaults are `127.0.0.1` / `9444` / `[]`.
- Config-file http fields are respected; CLI overrides win.
- Fractional `httpPort` is ignored with a warning.
- `validateTransportConfig()` accepts `mode: 'http'` and rejects bad host/port/origins.

### Phase 3 Verification: CLI Arguments

```bash
npm test -- tests/unit/
```

Expected: `--transport http`, `--http-host`, `--http-port`,
`--http-allowed-origins` parse correctly; invalid `--transport` value rejected.

### Phase 4 Verification: Shared and Streamable Modules

```bash
npm test -- tests/unit/streamableHttp.test.ts tests/unit/transport.test.ts
```

Expected: shared-module origin tests pass; refactored SSE transport tests still
pass (no behavior change); a hostile-origin `POST /mcp` returns 403.

### Phase 5 Verification: CLIServer Integration

```bash
npm run build
node dist/index.js --shell gitbash --transport http --debug
```

Expected (manual): startup logs the bind address/port for `/mcp`; a liveness
check against an unknown path returns `404`; `Ctrl+C` exits cleanly.

### Phase 6 Verification: Integration Tests

```bash
npm test -- tests/integration/streamable-http-transport.test.ts
npm test
```

Expected:

- initialize over `POST /mcp` returns a `Mcp-Session-Id`; `tools/list`,
  `tools/call`, `resources/read` succeed.
- Two sessions have isolated active directories; unknown session returns `404`;
  `DELETE /mcp` terminates a session.
- Untrusted origin `403`; configured origin admitted with CORS; malformed `Host`
  `400` without crash.
- Full regression green; stdio and legacy SSE suites unaffected.

### Linter

```bash
npm run lint
npx markdownlint-cli2 "README.md" "docs/tasks/streamable_http_transport/*.md"
```

Expected: no TypeScript errors; no markdown errors.

### Regression Check

```bash
npm test
```

Expected: all tests pass, no regressions, no worker-exit warning.

## Final Acceptance Verification

The feature can be accepted when all items are true:

- [x] SDK upgraded to a version exporting `StreamableHTTPServerTransport`; lint + full suite green
- [x] `npx wcli0 --transport http` serves `/mcp` on `127.0.0.1:9444` and logs the bind address (with `--debug`)
- [x] `--http-host` / `--http-port` change the bind address
- [x] A Streamable HTTP client can initialize, receive `Mcp-Session-Id`, and run `tools/list`, `tools/call`, `resources/read`
- [x] Two concurrent sessions have isolated active working directories
- [x] `DELETE /mcp` terminates a session; later requests for it return `404`
- [x] Untrusted `Origin` -> `403`; no-origin allowed; configured origin admitted with CORS headers
- [x] Malformed `Host` header -> `400` and the server stays alive
- [x] `transport` config respected from file and overridden by CLI; `get_config` / `cli://config` report the active transport
- [x] `SIGINT` shuts down cleanly and releases the port with an open `/mcp` stream (cleanup() closes httpServer via the shared force-destroy path; covered by the port-release test)
- [x] `npx wcli0` (no flags) still starts stdio; `--transport sse` still starts legacy SSE, both unchanged (full stdio + SSE suites remain green)
- [x] New transport code has unit + integration coverage; `npm run lint` passes
