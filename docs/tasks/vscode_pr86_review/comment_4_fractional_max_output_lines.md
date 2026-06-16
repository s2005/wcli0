# P2 - Preserve valid fractional maxOutputLines values

When `maxOutputLines` is a fractional value such as `1.5` (the contributed
`number` setting permits it and the server's `validateLoggingConfig` accepts it
because it only enforces the `1..10000` range), the shared `isValidLogLimit`
integer check reports a blocking problem and the provider registers no server.
`maxReturnLines` does require an integer, but `maxOutputLines` does not.
Validate the two fields according to their actual server constraints. Source:
`vscode-extension/src/argsBuilder.ts:416`, server
`src/utils/config.ts` `validateLoggingConfig`.
