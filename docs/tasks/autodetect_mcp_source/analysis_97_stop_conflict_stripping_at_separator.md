# Analysis 97 - Stop conflict stripping at the option separator

## Decision: Valid — fix applied

P74 taught the parser to stop at `--` and round-trip the positional remainder verbatim, but the
three conflict strippers in `argsBuilder` — `stripValueFlag`, `stripConfigArgs`,
`stripTransportArgs` — still scanned the whole `extraArgs` list. So for `--shell cmd -- --shell bash`
the parser correctly modeled `cmd` and preserved `-- --shell bash` as positionals, and then, because
a shell WAS emitted, `stripValueFlag` deleted the positional `--shell bash` and the save wrote a
truncated `--shell cmd --`. The strippers exist to prevent yargs seeing a duplicate OPTION; a token
after the separator is not an option at all, so there was never anything to prevent there.

All three strippers now copy `--` and everything after it verbatim and stop matching. The
duplicate-prevention behavior before the separator is unchanged.

**Why:** Every scanner in this feature has to respect the same option/positional boundary yargs does
— P74 fixed the parse loop, P75 the suffix scan, P79 the safety-conflict scan, and the strippers
were the last ones reading past it. Copying the remainder rather than dropping the separator keeps
the round-trip exact, which is what makes a no-op save a no-op. See
[[analysis_74_stop_parsing_after_double_dash]] and [[analysis_61_strip_preserved_value_flags]].

**Commit:** bfa5c70 - fix(vscode): round-20 codex review follow-ups for PR #89 (P93-P97)
