# P33 - Correct the SSE automatic-provider documentation

The README transport section (vscode-extension/README.md:106) states that selecting `sse` makes the
provider point VS Code at the `/sse` endpoint, but `Wcli0McpProvider.provideMcpServerDefinitions`
logs a warning and returns no definition for SSE mode. Users following this section expect an
automatic connection that never appears. Document that only HTTP is auto-registered and that SSE
requires writing or configuring a `.vscode/mcp.json` entry separately.
