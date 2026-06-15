# P91 - Reject non-object JSON configuration files

In `vscode-extension/src/mcpProvider.ts:65`, `configFileIsLoadable` returns true for any successfully
parsed JSON. When `wcli0.configFile` contains syntactically valid JSON such as `null` (or an array, or
a scalar), this check returns true and the provider registers the server with an explicit `--config`.
The server then calls `Object.keys(loadedConfig)` in `loadConfig` (`src/utils/config.ts:160`), which
throws for `null`, so the registered MCP server exits immediately despite the extension considering the
file loadable. (Arrays and scalars instead produce zero keys, so the server silently discards the pin
and loads an implicit config — the same class of bypass P85 set out to block.) Require the parsed value
to be a non-null, non-array object before returning true.

Source: Codex review round 13 (pullrequestreview-4499884537), reviewed commit b583a78614.
