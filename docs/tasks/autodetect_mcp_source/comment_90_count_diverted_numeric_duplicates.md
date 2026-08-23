# P90 - Count diverted numeric occurrences when detecting duplicates

In `vscode-extension/src/configSource.ts:560` (the duplicate-scalar pre-scan in `parseServerArgs`),
mixed representable/unrepresentable repeats are excluded from the count: with
`--commandTimeout bad --commandTimeout 5` yargs produces the array `[NaN, 5]`, which
`applyCliSecurityOverrides` ignores because it is not a number, yet this pre-scan counts only the
second occurrence, after which the builder strips the preserved malformed copy and saves only
`--commandTimeout 5`, changing an otherwise no-op launch. Every syntactically present scalar
occurrence must be counted for duplicate preservation, even when one value is diverted from the typed
field.
