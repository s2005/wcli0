# Analysis 102 - Match yargs when recognizing negative numeric tokens

## Decision: Valid — fix applied

P93's predicate accepted more shapes than yargs actually consumes. Verified against the installed
parser: `-1`, `-1.5`, `-.5`, `-0` and `-01` ARE taken as the preceding option's value, but `-1e2`,
`-1e-2` and `-1.` are NOT — yargs reads `--shell -1e2` as an empty shell plus the short options `1`
and `e`. Accepting the exponent and trailing-dot forms modeled a value the server never sees, and
the save then rebuilt it as `--shell=-1e2`, which really would disable every known shell. The regex
is now `-(?:\d+(?:\.\d+)?|\.\d+)` — exactly the consumed forms, with no exponent and no trailing dot.

Writing the test for this surfaced a second, related mismatch of my own from P98. That change
counted a scalar occurrence on presence, which is right for a string option (`--shell --debug
--shell bash` => `['', 'bash']`) but wrong for a NUMBER option: yargs drops a valueless numeric
option entirely, so `--commandTimeout --commandTimeout 5` is just `5`, not an array. Counting it as
a duplicate preserved a pair the server resolves to one value and left the form showing no timeout.
The pre-scan now counts a number option only when a value token actually follows, and keeps
counting string/csv options on presence.

**Why:** Both halves are the same discipline these rounds have converged on — read the rule off the
installed parser rather than inferring it from what the token looks like. The narrower regex also
fails safe: a form yargs does not consume now stays a separate token and round-trips verbatim,
which is the outcome that cannot change a launch. See [[analysis_93_count_negative_numeric_values]]
and [[analysis_98_count_valueless_scalar_flags]].

**Commit:** f03b33f - fix(vscode): round-23 codex review follow-ups for PR #89 (P100-P102)
