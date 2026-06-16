# P34 - Do not show a global launch when managed storage is unavailable

In `showLaunchCommand` (vscode-extension/src/commands.ts:223), when per-shell settings require managed
mode but `managedConfigTargetDir()` returns undefined because no private directory can be created, the
code calls `buildLaunchSpec` without `managedConfigPath` and displays a normal global-flag command
that ignores every per-shell setting. The provider registers no server in the same failure scenario,
while the output still claims an auto-managed config is written to `undefined`. Report that no launch
is available instead of presenting a mismatched command.
