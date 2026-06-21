# P5 - Preserve full HTTP/SSE URLs when round-tripping

For an existing `type: "http"` or `"sse"` entry whose URL is not exactly the
extension-generated `http://host:port/mcp` or `/sse` shape, the load path keeps
only host and port. A subsequent Save reconstructs the URL from those fields, so
entries such as `https://gateway.example/custom/mcp` are silently downgraded to
`http://gateway.example:<port>/mcp` (or become unsaveable when the original URL
relied on a default port). Preserve the original URL parts or refuse editing URLs
the form cannot model.

Reference: `vscode-extension/src/configSource.ts` around line 282 (http/sse branch
of `parseMcpEntry`) and `writeMcpJsonFromSettings` URL reconstruction.
