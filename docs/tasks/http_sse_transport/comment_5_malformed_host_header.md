# P5 - Handle malformed Host headers

A client can send an invalid `Host` header such as `%%%%`. Node accepts the
request, but constructing the request URL with that value as the base via
`new URL()` at `src/utils/transport.ts:53` -- throws an `ERR_INVALID_URL`
exception before any
route-level handling. Because the HTTP callback is `async`, the throw becomes an
unhandled promise rejection and, under the default Node behavior, terminates the
process. An unauthenticated malformed request can therefore kill the SSE server.
Parse the URL defensively and return a 400 instead of letting the exception
escape.
