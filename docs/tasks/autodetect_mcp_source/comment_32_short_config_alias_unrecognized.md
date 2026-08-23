# P32 - The short-form `-c` / `--c` config alias is not recognized when loading an entry

The server's `config` option has alias `c`, and the forward builder's
`stripConfigArgs` recognizes every form yargs accepts (`-c X`, `--c X`,
`-c=X`, `--c=X`, `-cX` bundling, `--no-c`). But the reverse parser's
`VALUE_OPTIONS` table only lists `'--config'`. An entry authored with the short
form (e.g. `args: ["-y", "wcli0@latest", "-c", "config.json"]`) therefore parses
`-c` and `config.json` into `extraArgs`, leaving `configFile` empty. The
consequences: the form's Config-file field shows empty even though the entry
references a config file; the "references a config file via --config" parse note
never fires; and the `configFileLoadable` validation is skipped
(`resolvedConfigFilePath` returns undefined for an empty `configFile`, so the
loadability check defaults to loadable), letting a `-c` that points at a
missing/broken file save without the warning a `--config` pin would get. The
data itself survives via `extraArgs`, but the form/validation asymmetry with the
forward builder is the bug.
Reference: `vscode-extension/src/configSource.ts:121-142` versus
`vscode-extension/src/argsBuilder.ts:225-267`.
