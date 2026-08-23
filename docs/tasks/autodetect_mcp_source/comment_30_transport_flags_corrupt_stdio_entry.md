# P30 - Transport flags in a stdio entry's args flip the type and delete command/args on save

A `.vscode/mcp.json` entry whose `type` is `stdio` but whose `args` carry a
`--transport http` (or `--transport sse`) flag is silently converted into an
http/sse entry on save, deleting its `command`/`args`/`cwd`/`env`.
`parseMcpEntry` sets `transportMode = 'stdio'` from the entry `type`, then runs
`parseServerArgs` over the args and `Object.assign`s the result back onto the
settings. `--transport` is a recognized value-option, so the parsed
`transportMode` overwrites the value derived from `type`. On save,
`writeMcpJsonFromSettings` then takes the http/sse branch, generates
`{ type, url }`, and `mergeEntryOntoBase` deletes the entire stdio field set
(`command`, `args`, `cwd`, `env`, `envFile`, `dev`, `sandboxEnabled`) — so the
launcher that was in the file is gone, replaced by a default URL, with no
warning. The same root cause also drops `--http-host`/`--http-port`/
`--sse-host`/`--sse-port`/`--http-allowed-origins`/`--sse-allowed-origins` that
appear in a stdio entry's args: they are consumed into `transportHost`/
`transportPort`/`transportAllowedOrigins`, but the forward builder never emits
those flags for stdio, so they vanish on a no-op save. An entry's `type` is
authoritative for an mcp.json server entry; transport flags in the args must not
override it.
Reference: `vscode-extension/src/configSource.ts:381,422-423` and
`vscode-extension/src/commands.ts:548-570`.
