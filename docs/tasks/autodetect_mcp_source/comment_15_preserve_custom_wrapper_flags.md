# P15 - Avoid stealing wrapper options that look like server flags

For a custom stdio entry whose wrapper has its own `--config`, `--transport`, or similar
option before invoking wcli0, the split treated the first recognized flag as the start of
wcli0's flags. Loading then saving mapped the wrapper option into extension settings and
regenerated it after the launcher args, changing the wrapper's command line (e.g.
`mywrapper --config wrapper.json wcli0 --shell cmd` became a different launch). The
file-source round trip must preserve custom launcher arguments even when their names
overlap wcli0 flags.
File: `vscode-extension/src/configSource.ts:386`.
