# P66 - Reject non-numeric URL ports instead of treating them as omitted

In `vscode-extension/src/configSource.ts` (around line 753), `parseHttpUrl`'s
optional digit-only port group can fail while the overall regex still returns the
host with `port: undefined`. For a hand-authored http/sse entry whose URL has an
explicit but non-numeric port (`http://host:abc/mcp`, `http://host:-1/mcp`), the
save path treats that as an omitted/default-port URL and preserves it verbatim
whenever the host is unchanged, so editing only the port field cannot fix the
malformed URL. An explicit malformed port must be detected as invalid rather than
classified as omitted.
