# P112 - Keep positionals out of rebuilt allowed-directory arrays

In `vscode-extension/src/configSource.ts` (line 988) a bare positional argument is preserved in
`extraArgs`, and because `buildServerArgs` appends `extraArgs` after the flags it generates from
the typed fields, a direct entry such as `wcli0 marker --allowedDir C:/trusted` - which yargs
reads as the positional `marker` plus the single allowed directory `C:/trusted` - is rebuilt as
`--allowedDir C:/trusted marker`, where yargs greedily consumes `marker` as a second allowed
directory, so saving any unrelated field silently expands the server's permitted
working-directory scope.
