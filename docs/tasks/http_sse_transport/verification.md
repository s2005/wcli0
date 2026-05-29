# Verification Plan: HTTP/SSE Transport for MCP Server

## Purpose

Verify that HTTP/SSE transport is correctly implemented alongside existing stdio transport, with proper configuration, CLI flags, and test coverage.

## Pre-Implementation Verification

### Existing Tests Pass

```bash
npm test
```

Expected: all pass.

### Linter Clean

```bash
npm run lint
```

Expected: no errors.

### Coverage Baseline (Before)

| Module | Baseline Coverage | After Coverage | Delta |
| ------ | ----------------- | -------------- | ----- |
| src/index.ts | -- % | -- % | -- % |
| src/utils/config.ts | -- % | -- % | -- % |
| src/types/config.ts | -- % | -- % | -- % |
| src/utils/transport.ts | N/A (new) | -- % | N/A |

## Post-Implementation Verification

### Phase 1 Verification: Types and Configuration

```bash
npm test -- tests/unit/ --testNamePattern="transport config"
```

Expected:

- Transport config defaults to stdio mode.
- `applyCliTransport()` overrides mode, host, port.
- CLI flags override config file values.

### Phase 2 Verification: CLI Arguments

```bash
npm test -- tests/unit/ --testNamePattern="parseArgs.*transport"
```

Expected:

- `--transport stdio` and `--transport sse` are accepted.
- `--sse-host` and `--sse-port` are parsed.
- Invalid `--transport` value is rejected by yargs choices.

### Phase 3 Verification: SSE Transport Module

```bash
npm test -- tests/unit/transport.test.ts
```

Expected:

- HTTP server starts and listens.
- GET `/sse` returns SSE headers.
- POST `/messages` routes to correct session.
- Unknown session returns appropriate error.

### Phase 4 Verification: CLIServer Integration

```bash
npm test -- tests/integration/sse-transport.test.ts
```

Expected:

- Server starts in SSE mode when configured.
- Full MCP initialize handshake completes over SSE.
- Server shuts down cleanly.
- Stdio mode still passes all existing tests.

### Phase 5 Verification: Documentation

```bash
npm run lint
```

Expected: no errors, README references are valid.

### Linter

```bash
npm run lint
```

Expected: no errors.

### Regression Check

```bash
npm test
```

Expected: all tests pass, no regressions.

## Final Acceptance Verification

The feature can be accepted when all items are true:

- [x] `npx wcli0` starts in stdio mode (unchanged behavior) -- default `transport.mode` is `stdio`; `sse-transport.test.ts` confirms stdio mode creates no HTTP server
- [x] `npx wcli0 --transport sse` starts HTTP server on `127.0.0.1:9444` -- defaults verified in `transport.test.ts`; SSE startup verified in `sse-transport.test.ts`
- [x] `npx wcli0 --transport sse --sse-host 0.0.0.0 --sse-port 3000` binds to `0.0.0.0:3000` -- `applyCliTransport` override verified in `transport.test.ts`; bind host/port verified in `sse-transport.test.ts`
- [x] SSE client can connect, initialize, and receive responses -- `sse-transport.test.ts`, `sse-tool-execution.test.ts`
- [x] Config file `transport` section is respected -- `transport.test.ts`
- [x] CLI flags override config file values -- `transport.test.ts`
- [x] Graceful shutdown works in SSE mode -- `closeSseServer` + `CLIServer.cleanup` verified in `sse-transport.test.ts`
- [x] All existing tests pass (no regression) -- full `npm test` suite green
- [x] `npm run lint` passes -- `tsc --noEmit` clean
- [x] New transport code has test coverage -- unit (`transport.test.ts`) + integration (`sse-transport`, `sse-tool-execution`, `sse-security`, `sse-resources`, `sse-edge-cases`)
