# P102 - Match yargs when recognizing negative numeric tokens

In `vscode-extension/src/configSource.ts:266`, the negative-number predicate also accepts scientific
notation and trailing-dot forms that the installed yargs parser does not consume as option values:
yargs parses `--shell -1e2` as an empty `shell` plus the short options `1` and `e`, so the server
keeps its default shells, while this reverse parser models `-1e2` as the shell value and rebuilds it
as `--shell=-1e2`, which disables every known shell on a no-op Save. The predicate must be restricted
to the negative decimal forms yargs actually consumes.
