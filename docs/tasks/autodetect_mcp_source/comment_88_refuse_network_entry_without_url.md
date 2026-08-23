# P88 - Refuse network entries without a usable URL

In `vscode-extension/src/commands.ts:807` (the http/sse branch of `writeMcpJsonFromSettings`), a
loaded `http`/`sse` entry with no string `url` -- `{ "type": "http" }` or `url: ""` -- has no URL to
preserve, so the canonical fallback silently writes `http://127.0.0.1:9444/mcp` (or `/sse`) on an
otherwise no-op Save, turning an invalid or intentionally incomplete entry into a live local endpoint
without the user editing host or port. A file-source save must reject the missing URL or preserve the
original invalid state rather than manufacturing the defaults.
