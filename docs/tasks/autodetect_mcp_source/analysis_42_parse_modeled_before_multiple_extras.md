# Analysis 42 - Parse modeled flags before multiple valued extras

## Decision: Valid — fix applied

`isPureServerFlagRun` let only the FINAL unknown flag consume a following bare
value (the P24 trailing rule). A suffix with several unknown value-bearing
flags (`--shell cmd --future x --another y`) therefore failed the purity check at
`--shell` (the first `--future x` orphaned `x`), so `serverFlagSuffixStart`
split later and stranded `--shell cmd` in `customArgs`; the form then showed the
default shell and a later edit appended a second `--shell`. The fix lets EVERY
unrecognized `--flag` consume one following non-flag value (not just the last),
so a run of `--unknown value` pairs stays pure and the modeled flags before them
are recovered. A bare token that is NOT the value of a preceding unknown flag
(an orphan positional) still disqualifies the run, preserving P15/P17.

**Why:** The forward builder emits `[...launcherArgs, ...modeledFlags,
...extraArgs]`, and extraArgs are commonly `--flag value` pairs; the reverse
parser must recognize any number of them in the suffix, not only a single
trailing one, or it mis-splits and drops modeled flags.

**Proposed fix:** In `isPureServerFlagRun`, when an unrecognized `--flag` is
followed by a non-flag token, consume that token as the flag's value regardless
of position; keep rejecting a bare token that follows a RECOGNIZED value-option
already consumed, or a bare token with no preceding flag.

**Commit:** ceefe56 — fix(vscode): round-6 codex review follow-ups for PR #89 (parser + save round-trip)
