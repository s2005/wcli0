# Analysis 99 - Consume every greedy array value

## Decision: Valid — fix applied

The parser consumed exactly one value token per option, but yargs' `greedy-arrays` (default true)
makes an array option swallow every following value. Verified against the installed parser:
`--blockedCommand rm del --debug` gives `['rm', 'del']`, and the attached form
`--blockedCommand=rm del` does too. The server declares all four of these options with `array: true`
(`src/index.ts`), so this is what a real launch does. Modeling only `rm` left `del` in `extraArgs`,
and the rebuilt args put it after the modeled pair (`--blockedCommand rm --debug del`), where yargs
reads it as a positional — the blocklist quietly lost an entry on an unrelated save. The same applies
to `--allowedDir`, where losing a value narrows the allowed set, and to the blocked
argument/operator lists.

A `consumeGreedyArrayValues` helper now models the remaining values after both the space and attached
forms, and `isPureServerFlagRun` consumes them too, so a wrapper suffix like
`wrapper target --blockedCommand rm del` is still detected instead of failing on the "orphan" second
value. Only `array` kinds are greedy — the csv options (`--http-allowed-origins`) take a single
comma-separated token, matching their `type: 'string'` server declaration.

While testing this I confirmed a limit worth recording: yargs does NOT take a dash-prefixed
non-numeric token as an array value — `--blockedArgument -rf` leaves the array EMPTY and parses `-rf`
as short flags. The parser reproduces that (the run is preserved verbatim), and only the attached
`--blockedArgument=-rf` carries such a value, which round-trips attached via P73.

**Why:** Every value the parser fails to model becomes a token the rebuild can misplace, and for
these four options a misplaced token is a security setting that silently disappears — the same
shape as P96 and P98. Reading the rule off the installed parser rather than the flag's appearance is
what the last several rounds have converged on. See [[analysis_93_count_negative_numeric_values]] and
[[analysis_98_count_valueless_scalar_flags]].

**Commit:** 2ed694c - fix(vscode): round-22 codex review follow-up for PR #89 (P99)
