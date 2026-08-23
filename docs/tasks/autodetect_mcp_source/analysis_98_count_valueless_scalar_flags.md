# Analysis 98 - Count valueless scalar flags as duplicate occurrences

## Decision: Valid — fix applied

The duplicate pre-scan counted an occurrence only when a value token followed the flag, but yargs
defines the key from the flag's PRESENCE: verified against the installed parser, `--shell` with no
value gives `shell: ''`, and `--shell --debug --shell bash` gives `shell: ['', 'bash']`. An array is
not a usable shell name, so that entry enables no shell at all. The pre-scan saw one occurrence, so
`bash` was modeled into the field, the valueless `--shell` was preserved in `extraArgs` (P44), and
because the field was then emitted, `stripValueFlag` deleted the preserved copy — a no-op save
rewrote the entry as a single `--shell bash` and enabled command execution through Bash. Same shape
as P96 in the previous round, and P1 for the same reason: an unrelated edit widens what the server
can run.

The fix counts a scalar option on presence, whatever follows it, and does the same for a trailing
`c` in a single-dash bundle (`-c --debug` also defines config as `''`). Both occurrences are then
preserved verbatim, the field stays unset, nothing is emitted for it and nothing is stripped, so the
entry round-trips and still enables no shell. A single valueless flag is unaffected (count 1) and
keeps its existing P44 preservation.

**Why:** The pre-scan answers "would yargs see this key more than once?", which is about the flags
present, not the values they carry — the same correction as P90 (diverted values) and P93 (negative
values), now applied to the last case where a syntactically present occurrence was invisible.
Counting presence is also the simplest possible rule, which is what makes it hard to get wrong
again. See [[analysis_93_count_negative_numeric_values]] and
[[analysis_96_preserve_explicit_shell_all]].

**Commit:** 3981170 - fix(vscode): round-21 codex review follow-up for PR #89 (P98)
