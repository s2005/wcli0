# P8 - Avoid loading default-port URLs as invalid port 0

When a loaded HTTP/SSE URL omits an explicit port (for example
`https://gateway.example/custom/mcp`), `parseMcpEntry` stores `transportPort` as `0`.
That value is rendered into the webview's `transport.port` input, which has `min="1"`,
so `validateNumbers()` blocks Save before the host-side `transportUrl` preservation logic
can round-trip the URL. Users therefore cannot save an otherwise unchanged default-port
HTTP/SSE entry.
File: `vscode-extension/src/configSource.ts:401`.
