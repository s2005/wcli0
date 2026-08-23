# Analysis 93 - Count negative numeric values as scalar occurrences

## Decision: Valid — fix applied

Every "is the next token this option's value?" test in the parser used `!next.startsWith('-')`,
which is not what yargs does: yargs-parser also consumes a dash-prefixed token that LOOKS LIKE A
NUMBER. Verified against the installed parser — `--commandTimeout -1` gives `-1`, `--shell -1` gives
`'-1'`, while `--shell -x` gives `''` plus a separate `-x` flag. So a repeat with a negative value
was invisible to the duplicate pre-scan: `--commandTimeout -1 --commandTimeout 5` counted once, `5`
was modeled into the field, and the builder emitted `--commandTimeout 5` while `stripValueFlag`
removed the preserved `--commandTimeout` but left `-1` behind as an orphan. An entry the server
ignored entirely (yargs yields the array `[-1, 5]`) became one applying a five-second timeout.

A single `isOptionValue` helper now encodes yargs' rule (any non-dash token, or a negative number)
and is used by the pre-scan, the modeling loop and the `-c` bundle path; `argsBuilder` gains the
matching `isOptionValueToken` for its three strippers, so a stripped option takes its negative value
with it instead of orphaning it. Non-numeric dash tokens still count as separate flags, so the P44
"do not swallow the following option" behavior is unchanged.

**Why:** The parser and the strippers only stay correct while they agree with yargs about where a
value ends — the same class of mismatch as P74 (separator), P87 (attached booleans) and P89
(repeated booleans). Encoding the rule once, in a named helper on each side, makes the two sides
verifiably consistent rather than repeating a heuristic at six call sites. See
[[analysis_90_count_diverted_numeric_duplicates]] and [[analysis_61_strip_preserved_value_flags]].

**Commit:** bfa5c70 - fix(vscode): round-20 codex review follow-ups for PR #89 (P93-P97)
