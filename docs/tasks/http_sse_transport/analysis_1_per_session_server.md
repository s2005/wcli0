# Analysis 1 - Create a fresh MCP server per SSE session

## Decision: Valid -- fix applied

The shared-`Server` design is a genuine concurrency bug. The pinned SDK
(`@modelcontextprotocol/sdk@1.0.1`) implements `Protocol.connect(transport)` as
`this._transport = transport`, unconditionally replacing any previously connected
transport and its callbacks. Two concurrent SSE sessions on one `CLIServer`
therefore share a single protocol whose `_transport` points only at the most
recent stream, so the earlier session's responses are misrouted. The fix turns
`createSseServer()` into a per-connection factory: it now accepts a
`() => Server` callback and constructs a fresh, fully-wired `Server` for each
`GET /sse`. `CLIServer` exposes `createServerInstance()` (extracted from the
constructor) and `setupHandlers(server)` was parameterized so the same handler
set can be registered on any server instance. The shared `this.server` is still
used for stdio mode and shutdown.

**Why:** This mirrors the SDK's own legacy SSE example, which builds one server
per connection. It is the minimal change that gives each session an isolated
protocol/transport pair without duplicating handler logic. The existing
integration test "multiple concurrent SSE sessions" only spun up separate
`CLIServer` processes, so it never exercised two sessions sharing one server;
new tests cover that path directly.

**Commit:** 57358aa -- fix(transport): address Codex review feedback for PR #83
