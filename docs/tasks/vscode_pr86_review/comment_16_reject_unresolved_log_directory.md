# P16 - Reject unresolved log directories instead of dropping them

When `wcli0.logDirectory` contains an unresolved token such as
`${workspaceFolder}/logs` with no workspace open, `pathValue` returns `undefined`
and `buildServerArgs` silently omits `--logDirectory`, while `validateLaunchSpec`
performs no corresponding check. The provider then registers a server that keeps
logs only in memory instead of the configured persistent location. Report this as
a blocking configuration problem like the other path-like settings. Source:
`vscode-extension/src/argsBuilder.ts:212`.
