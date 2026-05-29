# P1 - Create a fresh MCP server per SSE session

`createSseServer()` reuses the single shared `Server` instance for every SSE
connection (`src/utils/transport.ts:21`), but the MCP `Protocol` object owns one
transport at a time: `connect()` overwrites `this._transport`, and its own
docstring states it "assumes ownership of the Transport ... and expects that it
is the only user of the Transport instance going forward." When a second client
opens `/sse` while the first stream is still connected, the second `connect()`
rebinds the protocol to the new transport, so responses for the first session can
be routed to the wrong stream (newer SDKs throw outright). The SDK's legacy SSE
example avoids this by constructing a new MCP server per SSE connection; this
server needs the same per-session protocol instance rather than sharing
`this.server` across sessions.
