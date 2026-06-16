# P24 - Validate log directories rejected by the server

When `wcli0.logDirectory` resolves successfully but violates the server's
remaining logging-path rules - for example a Windows path containing `?`, `*`, or
`|`, or a normalized path containing `..` - `validateLaunchSpec` reports no
blocking problem and the provider registers a process that immediately exits in
`validateLoggingConfig`. Mirror those server-side checks (`path.normalize`
traversal and, on Windows, the `<>"|?*` character set) so invalid settings are
rejected before publishing a broken server definition. Source:
`vscode-extension/src/argsBuilder.ts:426`.
