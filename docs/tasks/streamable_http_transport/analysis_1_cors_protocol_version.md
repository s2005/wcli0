# Analysis 1 - Allow Mcp-Protocol-Version in CORS preflight

## Decision: Valid — fix applied

The preflight allow-list omitted `Mcp-Protocol-Version`. Added it to the
`Access-Control-Allow-Headers` value returned by the OPTIONS handler in
`src/utils/streamableHttp.ts`, so allowed cross-origin browser clients can send
the header the MCP spec requires on all post-initialize requests.

**Why:** The MCP Streamable HTTP transport (and the bundled SDK
`StreamableHTTPServerTransport`, which calls `validateProtocolVersion` reading
the `mcp-protocol-version` header) requires clients to send
`Mcp-Protocol-Version` on every request after initialize. CORS preflight only
succeeds when every non-safelisted requested header appears in
`Access-Control-Allow-Headers`; otherwise the browser blocks the real request.
Without this header in the allow-list, browser clients could complete the
initialize handshake but fail on every subsequent session request — a real
interoperability defect for the documented browser-client use case.

**Commit:** 6faafac — fix(transport): address review feedback for PR #84
