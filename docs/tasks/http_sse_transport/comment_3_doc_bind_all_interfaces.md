# P3 - Avoid advertising unauthenticated bind-all-interfaces example

The README documents a `--sse-host 0.0.0.0` example (`README.md:495`). When users
copy this onto a shared or untrusted network, the HTTP transport exposes the MCP
server's command-execution tools to any host that can reach the port, and the
implementation adds no authentication. Keep the documented example bound to
localhost and include a prominent security requirement to place authenticated
access control in front of the server before binding to all interfaces.
