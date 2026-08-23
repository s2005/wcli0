# P43 - Keep scanning after ambiguous launcher-only flags

When a custom (non-wcli0) launcher has a valueless wrapper flag before the wcli0
suffix, e.g. `wrapper --no-cache --shell bash`, `isPureServerFlagRun(args.slice(0))`
succeeds because the unknown `--no-cache` is accepted as an extra leading flag, so
`serverFlagSuffixStart` returns `0`. The index-0 guard for non-wcli0 commands then
treats the entire argv as launcher args, so the loaded form shows the default shell
(`shell=all`) and changing the shell appends a second `--shell` instead of replacing
the existing one. The split must continue looking for a later suffix that begins with
a modeled flag instead of giving up when the index-0 run is rejected.
Reference: `vscode-extension/src/configSource.ts:269-276`
(`serverFlagSuffixStart`) and `:560-562` (the index-0 guard).
