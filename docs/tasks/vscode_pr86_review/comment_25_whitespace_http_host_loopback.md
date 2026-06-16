# P25 - Default whitespace-only HTTP hosts to loopback

When `wcli0.transport.host` is whitespace-only, the fallback in `clientHost` is
applied before trimming, so `(bindHost || '127.0.0.1').trim()` returns an empty
string. HTTP provider registration and `.vscode/mcp.json` export then construct an
unusable URL such as `http://:9444/mcp`. Apply the loopback default after trimming.
Source: `vscode-extension/src/mcpProvider.ts:189`.
