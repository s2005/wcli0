# PRD: HTTP/SSE Transport for MCP Server

## Objective

Add HTTP/SSE transport protocol support to the wcli0 MCP server, enabling remote and browser-based clients to connect via HTTP, in addition to the existing stdio transport. The server will default to stdio but can be switched to HTTP/SSE mode via CLI flags with configurable host and port.

## Background

The wcli0 MCP server currently supports only stdio transport (`StdioServerTransport`), which limits usage to local CLI integrations (e.g., `npx wcli0`). Some MCP clients (web-based tools, remote orchestrators) require HTTP/SSE transport to connect over a network. The MCP SDK v1.0.1 already includes `SSEServerTransport` in `@modelcontextprotocol/sdk/server/sse.js`, which handles the SSE + HTTP POST pattern for bidirectional JSON-RPC communication.

## Requirements

### REQ-1: Transport Mode Selection

The server must accept a `--transport` CLI flag that selects between `stdio` (default) and `sse` transport modes. When `--transport sse` is specified, the server starts an HTTP server with SSE transport instead of stdio.

### REQ-2: SSE Host Configuration

The server must accept a `--sse-host` CLI flag to configure the bind address for the HTTP server. Default value: `127.0.0.1`. Only applies when `--transport sse` is used.

### REQ-3: SSE Port Configuration

The server must accept a `--sse-port` CLI flag to configure the listening port for the HTTP server. Default value: `9444`. Only applies when `--transport sse` is used.

### REQ-4: HTTP Server Lifecycle

When running in SSE mode, the server must:

- Create an `http.createServer` instance
- Handle GET requests on `/sse` to establish SSE connections via `SSEServerTransport`
- Handle POST requests on `/messages` to receive client messages, routing them by session ID
- Log the listening address and port on startup
- Gracefully shut down the HTTP server on SIGINT/SIGTERM

### REQ-5: Configuration File Support

The `transport`, `sseHost`, and `ssePort` settings must also be configurable via the JSON config file (`win-cli-mcp.config.json`) under a top-level `transport` key, with CLI flags taking precedence.

### REQ-6: Backward Compatibility

All existing stdio behavior must remain unchanged. When no `--transport` flag is provided, the server must behave exactly as before. The `CLIServer` class must export its interface so both transports can be tested without starting the actual server.

### REQ-7: Tests

All new transport code must be covered by unit and integration tests:

- Unit tests for transport selection logic (stdio vs SSE based on config/CLI args)
- Unit tests for CLI argument parsing of `--transport`, `--sse-host`, `--sse-port`
- Integration tests verifying SSE transport starts, accepts connections, and processes requests
- Integration tests verifying stdio transport is unaffected

## Non-Requirements

- Streamable HTTP transport (the newer protocol variant) is out of scope; only classic SSE is implemented.
- Authentication or TLS/SSL for the HTTP server is out of scope.
- Multi-client session management beyond what `SSEServerTransport` provides out of the box.
- Docker or deployment configuration changes.

## Acceptance Criteria

1. Running `npx wcli0` without flags starts the server in stdio mode (existing behavior unchanged).
2. Running `npx wcli0 --transport sse` starts an HTTP server on `127.0.0.1:9444`.
3. Running `npx wcli0 --transport sse --sse-host 0.0.0.0 --sse-port 3000` binds to `0.0.0.0:3000`.
4. An MCP client can connect to the SSE endpoint (`GET /sse`), receive the endpoint URI, and send messages (`POST /messages`).
5. The `transport` config section in JSON config is respected when no CLI override is given.
6. CLI flags override config file values for transport settings.
7. The server logs the bind address and port when SSE mode starts.
8. SIGINT/SIGTERM gracefully shuts down the HTTP server in SSE mode.
9. All new and existing tests pass.
10. `npm run lint` passes with no new errors.

## Deliverables

| Deliverable | Type |
| ----------- | ---- |
| `src/index.ts` | Update - transport selection in `CLIServer.run()` and `parseArgs()` |
| `src/utils/transport.ts` | Create - SSE transport factory and HTTP server setup |
| `src/types/config.ts` | Update - add transport config type |
| `src/utils/config.ts` | Update - load transport config from file, apply CLI overrides |
| `tests/unit/transport.test.ts` | Create - unit tests for transport selection logic |
| `tests/integration/sse-transport.test.ts` | Create - integration tests for SSE transport |
| `README.md` | Update - document new CLI flags and config options |
