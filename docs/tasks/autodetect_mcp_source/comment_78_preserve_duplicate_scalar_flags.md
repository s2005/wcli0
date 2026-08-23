# P78 - Preserve duplicate scalar flags instead of last-wins

In `vscode-extension/src/configSource.ts:417` (`parseServerArgs` / `applyValue`), when a loaded
entry repeats a scalar option this assignment overwrites the earlier value, but yargs parses
repeated scalars as arrays and the server often handles that very differently. For example,
`--config a --config b` is not equivalent to `--config b` (config loading treats the array path
differently), and `--shell cmd --shell bash` is not equivalent to only `bash`; a no-op save
currently collapses those hand-authored entries to the last value and silently changes launch
behavior. The parser must detect duplicate scalar options and preserve/refuse them rather than
modeling them as last-wins.
