# P100 - Validate every numeric field before posting form values

The webview Save handler validates only `transport.port`, while the other
constrained number inputs (global and per-shell timeouts, command lengths, and
`maxOutputLines`) are posted even when their HTML validity fails or they exceed the
server's limits. Entering `commandTimeout = 0` or `maxOutputLines = 10001` and
clicking Save persists the invalid setting, after which `validateLaunchSpec` makes
the provider register no server; the export handlers bypass even the port check.
Validate all applicable numeric controls before any save or export action posts
values (`webview.ts`, around line 1095).
