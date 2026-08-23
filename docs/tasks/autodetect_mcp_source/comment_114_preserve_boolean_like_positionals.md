# P114 - Preserve boolean-like positionals before boolean flags

In `vscode-extension/src/argsBuilder.ts` (line 660) the guard that relocates a leading run of
positionals preserved in `extraArgs` fires only when a greedy array option was emitted, so a direct
entry such as `args: ["false", "--enableTruncation=true"]` - parsed as the positional `false` plus
truncation enabled - is rebuilt as `["--enableTruncation", "false"]`, where yargs consumes the
following `false` as the boolean option's value (the behavior already documented at
`configSource.ts:646-654`), so saving an unrelated field disables truncation and drops the
positional.
