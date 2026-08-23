# P77 - Do not let stdio transport flags prove a server suffix

In `vscode-extension/src/configSource.ts:274` (`isPureServerFlagRun` / the suffix detector), a stdio
entry deliberately does not model `--transport`/`--http-*`/`--sse-*` flags (the entry's `type` is
authoritative), but the suffix detector still treats any `VALUE_OPTIONS` flag as modeled evidence.
A wrapper command like `wrapper target --transport fast` therefore gets split even though there are
no editable wcli0 flags; after the user changes any real form field, the regenerated flags are
inserted before that wrapper option (`target --shell cmd --transport fast`), changing the wrapper
invocation order. In a stdio context transport flags must not count as modeled evidence of a wcli0
server suffix.
