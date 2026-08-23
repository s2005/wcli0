# Analysis 90 - Count diverted numeric occurrences when detecting duplicates

## Decision: Valid â€” fix applied

The P78 duplicate pre-scan was written to mirror the modeling paths exactly, so it skipped an
occurrence whose numeric value `divertNumber` would keep out of the typed field. That made a MIXED
repeat invisible: `--commandTimeout bad --commandTimeout 5` counted once, so the malformed copy was
diverted to `extraArgs` and `5` was modeled into the field. The builder then emitted
`--commandTimeout 5` and â€” because the field was set â€” stripped the preserved malformed copy (P61),
turning an entry the server ignored entirely (yargs yields the array `['bad', 5]`, which
`applyCliSecurityOverrides` rejects as not-a-number, so the default timeout applied) into one that
really applies 5.

The fix counts every syntactically present scalar occurrence, diverted or not. Both occurrences are
then preserved verbatim, the typed field stays unset, nothing is emitted for it and nothing is
stripped, so the pair round-trips in order. A single diverted occurrence is unaffected (count 1),
keeping the P34/P59/P64 preservation behavior intact.

**Why:** The pre-scan's real question is "would yargs see this key twice?", which is a syntactic
question â€” the diversion rule is about what the FORM can hold, a different concern that was
conflated with it. Answering the syntactic question makes the scan agree with yargs for mixed
repeats and, as a bonus, makes it simpler than the version it replaces. See
[[analysis_78_preserve_duplicate_scalar_flags]] and [[analysis_61_strip_preserved_value_flags]].

**Commit:** 5d7e6fe - fix(vscode): round-19 codex review follow-ups for PR #89 (P89-P92)
