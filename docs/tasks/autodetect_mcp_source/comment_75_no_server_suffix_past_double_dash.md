# P75 - Do not scan past `--` for a server suffix

In `vscode-extension/src/configSource.ts:327` (`serverFlagSuffixStart`), although
`isPureServerFlagRun` rejects a candidate suffix that starts with `--`, the loop advances to the
next token and can treat flags after the separator as wcli0 options. With a direct entry like
`command: "wcli0", args: ["--", "--debug"]`, yargs-parser leaves `--debug` positional, but the
reverse parser splits at index 1 and a no-op save enables debug. Once the scan reaches the wcli0
binary's own `--`, the rest should stay with the launcher/positionals rather than being considered
a server-flag suffix.
