# P111 - Preserve trailing valueless numeric duplicates

In `vscode-extension/src/configSource.ts` (line 623) the duplicate-scalar pre-scan counts a
number option only when a value token follows it, so a trailing valueless repeat such as
`--maxCommandLength 1000000 --maxCommandLength` is not counted; yargs is order-sensitive and
resolves that pair to the array `[1000000, null]`, which the server ignores in favour of its
safer default, yet the parser models `1000000` and the builder then strips the preserved
valueless token, so saving an unrelated field silently activates the much weaker
command-length limit (and the same shape can activate a long command timeout).
