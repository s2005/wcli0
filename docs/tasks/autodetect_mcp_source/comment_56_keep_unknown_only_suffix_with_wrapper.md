# P56 - Keep unknown-only suffix flags with wrapper args

When a custom non-`wcli0` command has its own trailing option after a positional, such
as `wrapper target --verbose`, `isPureServerFlagRun` returns true even though the suffix
contains no modeled wcli0 flag, so `parseMcpEntry` moves `--verbose` into `extraArgs`. A
later unrelated edit then emits generated server flags before that extra arg
(`target --shell cmd --verbose`), changing the wrapper invocation. An unknown-only suffix
should stay in `customArgs` unless there is evidence of a modeled server-flag suffix.
File: `vscode-extension/src/configSource.ts:281` (`isPureServerFlagRun` /
`serverFlagSuffixStart`).
