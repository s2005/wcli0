# P107 - Reject delimiters in edited transport hosts

In `vscode-extension/src/commands.ts:830`, when editing an HTTP/SSE file source the host field is
interpolated into the URL without validating that it is an authority host: entering
`gateway.example/api` reports a successful save but writes `http://gateway.example/api:9444/mcp`, and
on reload `parseHttpUrl` reads the host as only `gateway.example` with no explicit port, so the
accepted edit is lost and the endpoint path is malformed. Host values containing path, query,
fragment or userinfo delimiters must be rejected before the URL is constructed.
