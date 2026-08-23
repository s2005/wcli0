# P99 - Consume every greedy array value

In `vscode-extension/src/configSource.ts:915` (the space-separated value path in `parseServerArgs`),
an array option followed by multiple values consumes only the first, even though the server marks
`--blockedCommand`, `--blockedArgument`, `--blockedOperator` and `--allowedDir` as arrays and
yargs-parser documents that `greedy-arrays` defaults to true and consumes multiple following
positionals. For example `--blockedCommand rm del --debug` initially blocks both commands, but a
no-op file save models only `rm`, preserves `del` as `extraArgs`, and rebuilds
`--blockedCommand rm --debug del`; yargs then treats `del` as positional, silently removing it from
the blocklist. All consecutive values for array options must be consumed so the save preserves their
security semantics.
