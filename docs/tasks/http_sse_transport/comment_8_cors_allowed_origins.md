# P8 - Return CORS headers for allowed browser origins

For the advertised web-based MCP clients, a page served from an allowed loopback
origin but a different port still issues a cross-origin EventSource/fetch request
to this server. After the `Origin` check passes (`src/utils/transport.ts:62`),
the responses never include `Access-Control-Allow-Origin`, and a
`POST /messages` with `application/json` also needs an `OPTIONS` preflight that
currently falls through to 404. Browsers therefore block the connection before
the MCP handshake can complete. Echo the allowed origin on responses and answer
preflight `OPTIONS` requests when the `Origin` is accepted.
