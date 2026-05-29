# P6 - Track sockets instead of relying on closeAllConnections

`closeSseServer()` (`src/utils/transport.ts:150`) destroys lingering sockets only
through `server.closeAllConnections()`. That API was added in Node 18.2, but the
package still allows Node 18.0/18.1 via `engines.node >=18.0.0`, where the method
is `undefined` and the fallback becomes a no-op. With any active `/sse` stream,
`server.close()` then waits for the client to disconnect on its own, so
`cleanup()`/SIGINT can hang indefinitely. Track the open sockets explicitly and
destroy them on shutdown (or raise the minimum Node version) so close always
completes.
