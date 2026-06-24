# P10 - Preserve socket and pipe URLs instead of rewriting them

For supported HTTP/SSE entries that use a socket-style URL such as
`unix:///tmp/server.sock#/mcp` or `pipe:///pipe/name`, `parseHttpUrl` returns undefined
and `parseMcpEntry` only adds a note, leaving `transportUrl` unset. An unchanged Save
then uses the default host/port and rewrites the entry to `http://127.0.0.1:9444/mcp`,
breaking the configured socket/named-pipe server. Keep the original URL whenever it
cannot be decomposed into host and port.
File: `vscode-extension/src/configSource.ts:330`.
