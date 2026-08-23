# Analysis 111 - Preserve trailing valueless numeric duplicates

## Decision: Valid - fix applied

The duplicate-scalar pre-scan in `vscode-extension/src/configSource.ts` skipped every valueless
number occurrence, which is right only for a LEADING one; verified against the installed
yargs-parser, a valueless number option is dropped only while its key is still undefined
(`--commandTimeout --commandTimeout 5` => `5`), whereas once an earlier occurrence has defined the
key the repeat is appended as null and the option becomes an array
(`--maxCommandLength 1000000 --maxCommandLength` => `[1000000, null]`). The condition now also
counts a valueless number when the key already has a counted occurrence, so the trailing form is
recognized as a duplicate and every token round-trips verbatim in `extraArgs` instead of being
modeled and then stripped.

**Why:** `applyCliSecurityOverrides` ignores an array value because it is not a number, so the
authored entry runs on the server's own (much stricter) command-length limit and default command
timeout. Modeling `1000000` made the form show the weaker limit and let the builder emit a plain
`--maxCommandLength 1000000`, so saving an unrelated field silently activated a limit the entry
never applied - the same class of regression as P90 (a diverted numeric occurrence still counts)
and the exact mirror of P102, whose leading-valueless case the new condition deliberately leaves
untouched and which is now pinned by its own regression test.

**Commit:** 75d6868 - fix(vscode): address review feedback for PR #93 (P111-P112)
