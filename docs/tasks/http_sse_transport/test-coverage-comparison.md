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
| `initialize` handshake | No (bypassed via `_executeTool`) | Yes |
| `notifications/initialized` | No | Yes |
| `tools/list` | No (bypassed) | Yes |
| `tools/call` (get_config) | Yes (direct) | Yes (over SSE) |
| `tools/call` (execute_command) | Yes (direct) | No |
| `tools/call` (validate_directories) | Yes (direct) | No |
| `resources/list` | No | No |
| `resources/read` | No | No |
| `resources/templates/list` | No | No |

## Tool-Level Coverage

| Tool / Feature | stdio | HTTP/SSE |
| -------------- | ----- | -------- |
| `get_config` returns valid JSON | Yes | Yes |
| `validate_directories` valid path | Yes | No |
| `validate_directories` invalid path | No | No |
| `execute_command` basic echo | Yes | No |
| `execute_command` with workingDir | Yes | No |
| `execute_command` blocked operators | Yes | No |
| `execute_command` path restriction | Yes | No |
| `execute_command` output truncation | Yes (unit tests) | No |
| `execute_command` timeout | Yes (unit tests) | No |
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
| Transport mode `stdio` produces no HTTP server | N/A | Yes |
| Transport config defaults (mode, host, port) | Yes (unit) | -- |
| `applyCliTransport` overrides | Yes (unit) | -- |
| CLI `--transport`, `--sse-host`, `--sse-port` flags | Yes (unit) | -- |
| Config merge transport section | Yes (unit) | -- |

## Security / Edge Cases

| Scenario | stdio | HTTP/SSE |
| -------- | ----- | -------- |
| Blocked operator rejection (`;`, `&`, etc.) | Yes | No |
| Working directory restriction enforcement | Yes | No |
| Working directory allowed path passes | Yes | No |
| Path validation edge cases | Yes (dedicated tests) | No |
| Path traversal prevention | Yes (unit tests) | No |
| Injection protection | Yes (integration) | No |
| Error response format | Yes | No |

## Gaps in HTTP/SSE Test Coverage

1. **No `execute_command` tool call over SSE** -- the most important tool is never exercised through the SSE transport
2. **No `validate_directories` tool call over SSE** -- second tool untested over SSE
3. **No error scenarios over SSE** -- blocked commands, invalid paths, timeout, truncation
4. **No resource handlers over SSE** -- `resources/list`, `resources/read`, `resources/templates/list`
5. **No concurrent request handling** -- multiple requests on the same session
6. **No SSE disconnection / reconnection** -- client drops and reconnects
7. **No large response over SSE** -- output truncation edge cases
8. **No malformed JSON-RPC over SSE** -- invalid request body handling

## Summary

| Metric | stdio | HTTP/SSE |
| ------ | ----- | -------- |
| Total test files (integration) | 3 | 1 |
| Total test cases (integration) | 7 | 11 |
| Tool calls tested | 3 (get_config, validate_directories, execute_command) | 1 (get_config only) |
| Security tests | 3 | 0 |
| Protocol handshake tested | No (bypassed) | Yes |

The stdio side has broad tool-level coverage but skips the MCP protocol handshake. The SSE side has good transport-layer and protocol-handshake coverage but barely exercises the actual tools over SSE.
