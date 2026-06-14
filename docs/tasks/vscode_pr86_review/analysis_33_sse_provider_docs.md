# Analysis 33 - Correct the SSE automatic-provider documentation

## Decision: Valid — fix applied

The README claimed the provider points VS Code at `http://<host>:<port>/mcp` (or `/sse`) for both
networked modes, but `provideMcpServerDefinitions` only auto-registers HTTP and logs a warning +
returns no definition for legacy SSE. Rewrote the transport section to state that only `http` is
auto-registered (at `/mcp`) and that `sse` requires running the server yourself and adding a
`.vscode/mcp.json` SSE entry (which the `Write .vscode/mcp.json` command produces).

**Why:** Documentation describing a non-existent automatic SSE connection misleads users into waiting
for a server that never appears; the text now matches the provider's actual behavior.
