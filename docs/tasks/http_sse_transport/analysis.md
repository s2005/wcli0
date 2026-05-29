# Analysis: HTTP/SSE Transport for MCP Server

## Goal

Enable the wcli0 MCP server to accept connections over HTTP/SSE in addition to the existing stdio transport, allowing remote and web-based MCP clients to use the server.

## Current Behavior

The server's transport is hard-coded in `src/index.ts:1352-1363`:

```typescript
async run(): Promise<void> {
  const transport = new StdioServerTransport();
  // ...
  await this.server.connect(transport);
  debugLog("Windows CLI MCP Server running on stdio");
}
```

- `CLIServer` class (line ~70-1460 in `src/index.ts`) owns the MCP `Server` instance and calls `run()` to connect.
- `parseArgs()` (line 70-164) uses yargs to define all CLI options. No transport-related flags exist.
- Configuration loading (`src/utils/config.ts`) handles file-based config and CLI overrides. No transport config exists.
- The `ServerConfig` type (`src/types/config.ts`) has no transport fields.
- The MCP SDK v1.0.1 provides `SSEServerTransport` at `@modelcontextprotocol/sdk/server/sse.js` which requires:
  - An endpoint path string (e.g., `/messages`)
  - A `ServerResponse` object for the initial SSE connection
  - The caller to manage `http.createServer` routing

## Feasibility

Straightforward. The MCP SDK already provides `SSEServerTransport` with the full SSE+POST protocol. The server already has a clean separation between config loading, server construction, and transport connection. Adding an alternative transport path is a matter of:

1. Detecting the desired transport mode from config/CLI.
2. If SSE: creating an HTTP server, handling GET `/sse` and POST `/messages`, and using `SSEServerTransport`.
3. If stdio: keeping existing behavior.

No breaking changes to existing code paths.

## Approach

### Recommended: Extract transport logic into a dedicated module

Create `src/utils/transport.ts` that exports:
- `createSseServer(mcpServer, host, port)` - sets up HTTP server with SSE routing
- `TransportConfig` type for host/port/mode

The `CLIServer.run()` method selects transport based on config and delegates.

| Advantages | Disadvantages |
| ---------- | ------------- |
| Clean separation of concerns | One new file to maintain |
| Easy to test transport logic in isolation | Slightly more indirection |
| stdio path remains untouched | |
| Future transports (WebSocket, streamable HTTP) fit the same pattern | |

## Implementation Notes

- `SSEServerTransport` constructor takes `(endpoint: string, res: ServerResponse)`. The server must hold a map of session ID to transport for routing POST requests.
- The MCP SDK's `SSEServerTransport` sets `res` headers and begins streaming. The HTTP server must call `transport.start()` after creating the transport with the response.
- POST `/messages` handling: parse the session ID from the URL query parameter (the SDK sends `?sessionId=...`), look up the transport, and call `transport.handlePostMessage(req, res)`.
- The HTTP server should use Node.js built-in `http` module (already a dependency via `@types/node`). No additional npm dependencies needed.
- `yargs` already validates CLI input, so `--transport` can use `choices: ['stdio', 'sse']` for validation.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| SSE transport session management edge cases | Follow MCP SDK patterns exactly; test multi-request flows |
| Port conflicts on CI runners | Use port 0 (OS-assigned) in tests, not the default 9444 |
| SIGINT handler needs to close HTTP server | Extend existing cleanup handler to close HTTP server if running |
| Config file migration for users with existing configs | Transport config is optional with sensible defaults; absent config means stdio |
| `SSEServerTransport` API assumptions may differ from our usage | Read SDK source carefully; write integration test first as a spike |

## Test Strategy

### Unit Tests (`tests/unit/transport.test.ts`)
- Transport selection logic: given config with transport mode, verify correct transport is created.
- CLI argument parsing: verify `--transport`, `--sse-host`, `--sse-port` are parsed correctly.
- Config override precedence: CLI > config file > default.
- Default values: verify stdio when no transport config, `127.0.0.1:9444` when SSE defaults.

### Integration Tests (`tests/integration/sse-transport.test.ts`)
- Start server in SSE mode on port 0 (ephemeral).
- Connect via HTTP GET to `/sse`, verify SSE stream opens.
- Send a JSON-RPC `initialize` message via POST `/messages`.
- Verify response is received on the SSE stream.
- Test graceful shutdown.
- Verify stdio mode still works (regression).
