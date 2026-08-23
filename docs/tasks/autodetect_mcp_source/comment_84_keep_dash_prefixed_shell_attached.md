# P84 - Keep dash-prefixed shell values attached

In `vscode-extension/src/configSource.ts:772` (the attached `--opt=value` path) together with
`buildServerArgs`, a loaded file entry using an attached shell value that begins with a dash, such as
`--shell=--unsafe`, is modeled as `shell="--unsafe"` and then rewritten as the two tokens
`--shell --unsafe`; yargs reads the original as a shell name but the rewritten form as an empty shell
value plus the active `unsafe` boolean, so a no-op Save can turn a nonfunctional hand-authored launch
into one with all safety restrictions disabled. The unrepresentable shell value must be
preserved/refused, or emitted through the same attached-value helper used for the other dash-prefixed
scalars.
