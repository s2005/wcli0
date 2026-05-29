# Analysis 13 - Register SSE session cleanup before connect()

## Decision: Valid -- fix applied

The prior code added the session to the `sessions` map, awaited
`sessionServer.connect(transport)`, and only then overwrote `transport.onclose`
to delete the map entry. `connect()` calls `transport.start()`, which writes the
SSE headers and attaches the SDK's own `res` `close` listener while `connect()`
is still awaiting; a client that opens `/sse` and disconnects during that window
fires the close event before the after-the-fact `onclose` handler is installed,
so the SDK handler runs alone and the map entry is never removed. The dead
session then leaks, and later POSTs route into `handlePostMessage()` (returning
`500` instead of `404`). The fix registers the cleanup directly on the response
(`res.on('close', ...)`) before calling `connect()`, so the listener is in place
before the response can close -- eliminating the race. The SDK transport still
runs its own `onclose` for protocol teardown (it is no longer overwritten), and
this listener only removes the routing entry. New integration tests exercise an
immediate disconnect right after the endpoint event and rapid
connect/immediate-disconnect cycles, asserting later POSTs return `404` and no
session leaks.

**Why:** Listening on the response object is race-free because, unlike
overwriting `transport.onclose` after `connect()` resolves, the listener is
attached synchronously before the SSE stream starts and therefore before the
client can disconnect. It also avoids depending on the SDK's internal ordering
of `onclose` assignment versus `start()`, which the previous approach implicitly
relied on.

**Commit:** e8cfa0f -- fix(transport): address fourth-round Codex review feedback for PR #83
