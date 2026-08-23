# P106 - Keep valueless scalar flags ahead of following positionals

In `vscode-extension/src/configSource.ts:969` (the space-separated value path in `parseServerArgs`),
a plain Node entry such as `node dist/index.js --shell --debug cmd` parses in yargs as an empty
`shell`, an enabled `debug`, and a positional `cmd`. This branch preserves `--shell` and later
preserves `cmd`, but the builder emits the modeled `--debug` before `extraArgs`, producing
`--debug --shell cmd`; yargs now treats `cmd` as the shell value, changing the enabled-shell set on a
no-op save. The original valueless-option sequence must be preserved or rejected when a modeled flag
intervenes before the positional.
