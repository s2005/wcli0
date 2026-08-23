# P19 - Drop stale transport-only fields when changing modes

When switching a loaded entry from HTTP/SSE to stdio or the reverse, the stale-key lists
omitted the unmodeled transport-specific fields that the merge now preserves. An HTTP entry
with `headers`/`oauth` switched to stdio kept those auth fields in the committed stdio
server, and a stdio entry with `envFile`/`dev`/`sandboxEnabled` switched to HTTP kept stale
local-launch fields. Remove the other transport's whole field set on mode changes instead
of only `url` or `command`/`args`/`cwd`/`env`.
File: `vscode-extension/src/commands.ts:257`.
