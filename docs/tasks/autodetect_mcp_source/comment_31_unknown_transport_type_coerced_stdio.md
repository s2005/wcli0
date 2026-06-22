# P31 - An unrecognized transport `type` is silently rewritten to stdio on save

`parseMcpEntry` treats any `entry.type` that is not exactly `'http'` or
`'sse'` as stdio: `const type = asString(entry.type) || 'stdio'` followed by a
case-sensitive `if (type === 'http' || type === 'sse')` check. So an entry
written with `type: "HTTP"` (uppercase), `type: "websocket"`, or any future/
typo transport value falls through to the stdio branch with `transportMode =
'stdio'` and no note. On save, `mergeEntryOntoBase` deletes `type` (it is in
both owned-key lists) and writes the generated `type` (`'stdio'` or
`'http'`/`'sse'`), so the original type is overwritten and the entry's transport
is corrupted without any prompt. This contradicts the preserve-or-warn principle
already applied to URLs (P5/P8/P10): a value the form cannot model should be
preserved verbatim or surfaced with a note, not silently coerced.
Reference: `vscode-extension/src/configSource.ts:333-335` and
`vscode-extension/src/commands.ts:283-286`.
