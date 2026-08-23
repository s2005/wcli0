# P48 - Compare file source transport types case-insensitively

`parseMcpEntry` intentionally accepts `type: "HTTP"` by lowercasing it, but the
`preservedFileUrl` preservation check compares the edited mode to the raw `type`
string. For an uppercase `HTTP`/`SSE` entry with a custom or default-port URL, a
no-op Save treats it as a mode switch and rebuilds the URL to the canonical
`http://host:port/...` form, losing the URL shape the parser promised to preserve.
Lowercase `base.type` before comparing it to `settings.transportMode`.
Reference: `vscode-extension/src/commands.ts:238-242` (`preservedFileUrl`).
