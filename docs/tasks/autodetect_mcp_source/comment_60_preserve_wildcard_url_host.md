# P60 - Preserve a user-authored wildcard URL host on a port-only file save

Editing only the port of an http/sse `.vscode/mcp.json` entry whose URL host is a wildcard
(`0.0.0.0` or `[::]`) silently rewrites the untouched host to loopback on save.

A committed entry `{"type":"http","url":"http://0.0.0.0:9444/mcp"}` parses to
`transportHost = '0.0.0.0'`, `transportPort = 9444`, with NO note (a canonical
`http://host:port/mcp` URL is treated as fully modeled by `isCanonicalTransportUrl`). A no-op
save preserves it verbatim through `preservedFileUrl` (host AND port match). But changing only
`transport.port` (9444 -> 8080) makes `preservedFileUrl` return `undefined` (the port no longer
matches), so the shared rebuild branch runs
`http://${clientHost(settings.transportHost)}:${port}/mcp`, and `clientHost('0.0.0.0')` returns
`127.0.0.1`. The written entry becomes `http://127.0.0.1:8080/mcp`: the host the user never
touched is silently changed, `ok = true`, no error, and no note. The post-save reparse then
loads `127.0.0.1` back into the form. The IPv6 wildcard `[::]` is likewise rewritten to `[::1]`,
and a user who types `0.0.0.0` / `[::]` directly into the Host field hits the same
corrupt-on-save.

Only the field the user edited (port) should change: the save should write
`http://0.0.0.0:8080/mcp`, preserving the untouched host verbatim — consistent with the no-op
save, which DOES preserve `0.0.0.0`. The `clientHost` bind-host -> connect-host normalization
belongs to the settings-driven export (which builds a fresh connectable URL from a bind
setting), not to the file-source rebuild, where the host came from a user-authored connect URL
and must round-trip. `isCanonicalTransportUrl` also wrongly assumes a wildcard URL round-trips
losslessly through host/port (it emits no note warning that editing the port will move the
host).
File: `vscode-extension/src/commands.ts:727-733` (the file-source URL rebuild, `clientHost` at
line 731); contrast `preservedFileUrl` at `commands.ts:261`.
