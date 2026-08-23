# P108 - Exclude attached negations from modeled suffix evidence

In `vscode-extension/src/configSource.ts:249` (`isRecognizedServerFlag`), a custom wrapper ending in a
token such as `wrapper target --no-debug=false` has that token treated as a modeled boolean and split
into the server suffix. The installed yargs-parser handles `--name=value` before boolean negation, so
this defines the unrelated `no-debug` key rather than negating `debug`, and `parseServerArgs` likewise
preserves it as an extra argument; after the user edits a real field such as Shell, saving changes the
order to `target --shell cmd --no-debug=false`, potentially changing the wrapper invocation. Attached
`--no-*=` forms must not prove that a wrapper has a wcli0 server suffix.
