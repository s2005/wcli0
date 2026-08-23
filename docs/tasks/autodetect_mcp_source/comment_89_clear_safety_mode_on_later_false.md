# P89 - Clear a prior safety mode when a later value is false

In `vscode-extension/src/configSource.ts:711` (`parseServerArgs`), when the same safety option occurs
more than once a later false value never resets the mode an earlier occurrence set: yargs parses
`--unsafe --unsafe=false` as `unsafe: false`, so the server keeps its safety protections, but this
parser produces `safetyMode: 'unsafe'` and a no-op file save rewrites the arguments to only
`--unsafe`, disabling all protections. `safe` must be assigned when the final `--unsafe` / `--yolo`
value is false, just as the negated spellings already do.
