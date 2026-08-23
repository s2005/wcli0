# P83 - Stop scanning generic wrappers after option separators

In `vscode-extension/src/configSource.ts:363` (`serverFlagSuffixStart`), a custom launch whose `--`
belongs to the invoked program -- `node --inspect dist/index.js -- --debug` -- keeps the suffix scan
running past the separator and models `--debug` as an active wcli0 flag, contradicting
`parseServerArgs`' own separator handling and the yargs usage in `src/index.ts`, where subsequent
tokens are positional; the form consequently reports Debug as enabled, and newly saved settings such
as `--shell cmd` are appended after the same separator, report as saved on reload, but remain
positional and never take effect. The scan must stop at `--` for generic custom commands unless a
specifically recognized wrapper syntax proves it is a pass-through separator.
