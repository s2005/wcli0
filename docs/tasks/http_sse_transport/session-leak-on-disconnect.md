# SSE Session Leak on Client Disconnect - Investigation

## Context

While closing test coverage gap #6 (SSE disconnection / reconnection) from
[test-coverage-comparison.md](test-coverage-comparison.md), a new integration
test in `tests/integration/sse-edge-cases.test.ts` asserted that a POST to a
session whose client had disconnected returns HTTP 404. Instead it returned
HTTP 500, exposing a real production bug in the SSE transport. This document
records the root cause and the fix (commit `621d457`).

## Summary of findings

- `createSseServer()` in `src/utils/transport.ts` registered a `transport.onclose`
  handler (to remove the session from its routing map) **before** calling
  `mcpServer.connect(transport)`.
- `mcpServer.connect()` overwrites `transport.onclose` with its own handler, so
  the session-cleanup handler was silently discarded.
- Consequently, sessions were **never removed from the routing map** when a
  client disconnected. Every disconnect leaked one `Map` entry for the lifetime
  of the server.
- A POST to a disconnected-but-still-mapped session passed the map lookup and
  reached `SSEServerTransport.handlePostMessage()`, which found its SSE response
  already gone and replied `500 SSE connection not established` instead of the
  expected `404 Session not found`.

## Root cause

`createSseServer()` set up cleanup in the wrong order:

```typescript
const transport = new SSEServerTransport('/messages', res);
sessions.set(transport.sessionId, transport);

transport.onclose = () => {
  sessions.delete(transport.sessionId);   // <- intended cleanup
  debugLog(`SSE session closed: ${transport.sessionId}`);
};

await mcpServer.connect(transport);        // <- overwrites onclose
```

The MCP SDK's `Protocol.connect()` (in `@modelcontextprotocol/sdk`,
`dist/shared/protocol.js`) reassigns the transport callbacks:

```js
async connect(transport) {
    this._transport = transport;
    this._transport.onclose = () => {
        this._onclose();
    };
    // ...also overwrites onerror and onmessage
    await this._transport.start();
}
```

Because `connect()` runs after our assignment, the SDK's `onclose` replaces ours.
When the client socket closes, `SSEServerTransport.start()`'s
`res.on("close", ...)` fires, sets the internal SSE response to `undefined`, and
invokes only the SDK `onclose` - never our `sessions.delete()`. The session entry
remains in the map.

### Why the response was 500 and not 404

`createSseServer()` routes POSTs in two stages:

1. Look up the session id in the map. Missing entry -> `404 Session not found`.
2. Found entry -> delegate to `transport.handlePostMessage(req, res)`.

After a disconnect the entry still existed (stage 1 passed), so the request
reached stage 2. But the transport's `_sseResponse` had already been cleared by
the socket-close event, so `handlePostMessage()` took its guard branch:

```js
if (!this._sseResponse) {
    const message = "SSE connection not established";
    res.writeHead(500).end(message);
    throw new Error(message);
}
```

Hence `500` for what should be a `404`.

## Impact

| Aspect | Effect |
| ------ | ------ |
| Memory | The session `Map` grew by one entry per client disconnect and was never reclaimed (unbounded growth on a long-running server). |
| Correctness | POSTs to a dead session returned `500` instead of `404`, misrepresenting the failure to clients. |
| Scope | SSE transport only (`--transport sse`). The stdio transport is unaffected. |

## Evidence

The failing assertion from `tests/integration/sse-edge-cases.test.ts`
("cleans up the session when the client disconnects"):

```text
expect(received).toBe(expected) // Object.is equality

Expected: 404
Received: 500
```

The test opens an SSE stream, confirms a POST is accepted (`202`), destroys the
client stream, then polls the session with a notification until it is removed.
Before the fix the session was never removed, so the poll only ever observed
`500` and the test timed out on the `404` expectation.

## Fix

`src/utils/transport.ts` - register cleanup **after** `connect()` and chain to the
SDK handler so the MCP server's own teardown still runs:

```typescript
const transport = new SSEServerTransport('/messages', res);
sessions.set(transport.sessionId, transport);

await mcpServer.connect(transport);

// mcpServer.connect() assigns its own transport.onclose handler, so any
// handler set before connect() is overwritten. Register session cleanup
// afterward and chain to the SDK handler so the MCP server's own teardown
// still runs.
const mcpOnClose = transport.onclose;
transport.onclose = () => {
  sessions.delete(transport.sessionId);
  debugLog(`SSE session closed: ${transport.sessionId}`);
  mcpOnClose?.();
};
```

## Verified outcome

- The disconnect test now observes `404` once the socket-close event is
  processed, and the reconnect test confirms a fresh session id is issued.
- Full regression (`npm test`): 918 passed, 24 skipped, 0 failed, no worker
  warnings.
- Lint (`npm run lint` / `tsc --noEmit`): clean.

## How to re-verify

```bash
# The disconnect/reconnect tests that exercise this path
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/integration/sse-edge-cases

# Full suite
node --experimental-vm-modules node_modules/jest/bin/jest.js
```

## Lessons

- When a library takes ownership of an object's callbacks on a lifecycle call
  (`connect`, `start`, `attach`), set your own callbacks **after** that call and
  chain to whatever the library installed, rather than assuming your earlier
  assignment survives.
- A transport-layer "it connects" test is not enough; session teardown on
  disconnect needs its own coverage. This bug was invisible until a test drove a
  real client disconnect and then probed the dead session.
