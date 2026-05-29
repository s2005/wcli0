# Test Coverage Comparison: stdio vs HTTP/SSE Transport

## Overview

The stdio transport is tested via `TestCLIServer` helper that calls `CLIServer._executeTool()` directly (in-process, no transport layer). The HTTP/SSE transport is tested via raw HTTP requests against a live server with real SSE connections.

## Test Files

| Aspect | stdio | HTTP/SSE |
| ------ | ----- | -------- |
| Test file | `tests/integration/mcpProtocol.test.ts` | `tests/integration/sse-transport.test.ts` |
| Unit/config file | `tests/unit/transport.test.ts` | (same file -- shared) |
| Shell exec tests | `tests/integration/shellExecution.test.ts` | (none) |
| E2E tests | `tests/integration/endToEnd.test.ts` | (none) |
| Test helper | `tests/helpers/TestCLIServer.ts` | (inline HTTP helpers) |
| Transport under test | N/A (direct `_executeTool` call) | Real HTTP server + SSE stream |

## MCP Protocol Methods

| Protocol Method | stdio | HTTP/SSE |
| --------------- | ----- | -------- |
| `initialize` handshake | Yes (Phase 6d) | Yes |
| `notifications/initialized` | Yes (Phase 6d) | Yes |
| `tools/list` | Yes (Phase 6d) | Yes |
| `tools/call` (get_config) | Yes (direct) | Yes (over SSE) |
| `tools/call` (execute_command) | Yes (direct) | Yes (Phase 6b) |
| `tools/call` (validate_directories) | Yes (direct) | Yes (Phase 6b) |
| `resources/list` | Yes (Phase 8a) | Yes (Phase 8a) |
| `resources/read` | Yes (Phase 8a) | Yes (Phase 8a) |
| `resources/templates/list` | Yes (Phase 8a) | Yes (Phase 8a) |

## Tool-Level Coverage

| Tool / Feature | stdio | HTTP/SSE |
| -------------- | ----- | -------- |
| `get_config` returns valid JSON | Yes | Yes |
| `validate_directories` valid path | Yes | Yes (Phase 6b) |
| `validate_directories` invalid path | No | Yes (Phase 6c) |
| `execute_command` basic echo | Yes | Yes (Phase 6b) |
| `execute_command` with workingDir | Yes | Yes (Phase 6b) |
| `execute_command` blocked operators | Yes | Yes (Phase 6c) |
| `execute_command` path restriction | Yes | Yes (Phase 6c) |
| `execute_command` output truncation | Yes (unit tests) | Yes (Phase 6b) |
| `execute_command` timeout | Yes (unit tests) | Yes (Phase 6b) |
| `execute_command` large untruncated output | Yes (unit tests) | Yes (Phase 8b) |
| `execute_command` logging | Yes (unit tests) | No |

## Transport-Layer Concerns

| Concern | stdio | HTTP/SSE |
| ------- | ----- | -------- |
| Server starts and listens | N/A | Yes |
| SSE endpoint returns `text/event-stream` | N/A | Yes |
| Session ID assigned on connect | N/A | Yes |
| POST `/messages` without session returns 400 | N/A | Yes |
| POST `/messages` with fake session returns 404 | N/A | Yes |
| Unknown path returns 404 | N/A | Yes |
| Server close / cleanup | N/A | Yes |
| Multiple concurrent SSE sessions | N/A | Yes |
| Concurrent requests on a single session | N/A | Yes (Phase 8b) |
| Client disconnect removes session from map | N/A | Yes (Phase 8b) |
| Reconnect issues a fresh session id | N/A | Yes (Phase 8b) |
| Transport mode `stdio` produces no HTTP server | N/A | Yes |
| Transport config defaults (mode, host, port) | Yes (unit) | -- |
| `applyCliTransport` overrides | Yes (unit) | -- |
| CLI `--transport`, `--sse-host`, `--sse-port` flags | Yes (unit) | -- |
| Config merge transport section | Yes (unit) | -- |

## Security / Edge Cases

| Scenario | stdio | HTTP/SSE |
| -------- | ----- | -------- |
| Blocked operator rejection (`;`, `&`, etc.) | Yes | Yes (Phase 6c) |
| Working directory restriction enforcement | Yes | Yes (Phase 6c) |
| Working directory allowed path passes | Yes | Yes (Phase 6c) |
| Path validation edge cases | Yes (dedicated tests) | No |
| Path traversal prevention | Yes (unit tests) | No |
| Injection protection | Yes (integration) | Yes (Phase 6c) |
| Error response format | Yes | Yes (Phase 6c) |
| Malformed JSON / non-JSON-RPC body | N/A | Yes (Phase 8b) |

## Gaps in HTTP/SSE Test Coverage

All gaps identified in the original analysis are now closed.

1. ~~No `execute_command` tool call over SSE~~ -- CLOSED (Phase 6b, `sse-tool-execution.test.ts`)
2. ~~No `validate_directories` tool call over SSE~~ -- CLOSED (Phase 6b, `sse-tool-execution.test.ts`)
3. ~~No error scenarios over SSE~~ -- CLOSED (Phase 6c, `sse-security.test.ts`)
4. ~~No resource handlers over SSE~~ -- CLOSED (Phase 8a, `sse-resources.test.ts`)
5. ~~No concurrent request handling on a single session~~ -- CLOSED (Phase 8b, `sse-edge-cases.test.ts`)
6. ~~No SSE disconnection / reconnection~~ -- CLOSED (Phase 8b, `sse-edge-cases.test.ts`); surfaced and fixed a session-leak bug in `src/utils/transport.ts`
7. ~~No large response over SSE~~ -- CLOSED (Phase 8b, `sse-edge-cases.test.ts`)
8. ~~No malformed JSON-RPC over SSE~~ -- CLOSED (Phase 8b, `sse-edge-cases.test.ts`)

### Remaining minor items (not in original gap list)

- `execute_command` logging assertions over SSE (covered by stdio unit tests).
- Path validation / traversal edge cases over SSE (covered by dedicated stdio tests; the validator is transport-agnostic).

## Summary

| Metric | stdio | HTTP/SSE |
| ------ | ----- | -------- |
| Total test files (integration) | 3 | 4 |
| Tool calls tested | get_config, validate_directories, execute_command | get_config, validate_directories, execute_command |
| Resource handlers tested | Yes (Phase 8a) | Yes (Phase 8a) |
| Security tests | Yes | Yes (Phase 6c) |
| Protocol handshake tested | Yes (Phase 6d) | Yes |
| Edge cases (concurrency, disconnect, malformed) | N/A | Yes (Phase 8b) |

Both transports now have matching coverage across the MCP protocol handshake,
all tools, resource handlers, and security scenarios. The SSE side additionally
covers transport-specific edge cases (session lifecycle, concurrency on a single
session, and malformed input handling).
