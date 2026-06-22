# P12 - Preserve stdio-only VS Code fields when saving

Existing stdio entries can include VS Code-supported fields such as `envFile`, `dev`, or
`sandboxEnabled`, but saving from the file source rebuilds the entry with only `type`,
`command`, `args`, optional `cwd`, and optional `env`. An unrelated form edit therefore
deletes those fields, so env files stop loading, development mode is disabled, or
sandboxing is turned off. The save path should merge the generated launch fields into the
loaded entry rather than reconstructing it.
File: `vscode-extension/src/commands.ts:340`.
