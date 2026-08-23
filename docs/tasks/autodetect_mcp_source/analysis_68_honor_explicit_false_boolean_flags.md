# Analysis 68 - Honor explicit false values for boolean flags

## Decision: Valid — fix applied

`parseServerArgs` matched each boolean/tri-state/safety flag by exact token and
recorded it as unconditionally true, leaving a following `false` to fall through
to `extraArgs`. yargs declares `allowAllDirs`/`debug`/`yolo`/`unsafe`/
`enableTruncation`/`enableLogResources` as `type:'boolean'`, and a boolean option
consumes a following bare `true`/`false` token as its value (verified against the
project's yargs: `--debug false` parses to `debug=false`, with the `false`
consumed rather than left as a positional). The form therefore showed the opposite
of what the server runs, and the stranded `false` could defeat a later edit. The
fix adds `boolValueAt`/`boolValueFollows` helpers and, for every positive boolean
spelling, models the explicit `true`/`false` value and consumes it (the `--no-*`
spellings already mean false and do not consume a token, matching yargs).

**Why:** The reverse parser's job is to model exactly what the server will run so
the form is faithful and a round-trip is lossless. yargs only consumes a following
`true`/`false` for a boolean (any other token stays a positional and the flag
reads true), so the helpers consume strictly those two literals — `--debug
notabool` keeps `debug=true` and leaves `notabool` for the existing extraArgs path,
matching yargs precisely. The negated forms are unchanged because yargs does not
consume a value after `--no-debug` (`--no-debug false` leaves `false` as a
positional).

**Commit:** de5c856 — fix(vscode): round-13 codex review follow-ups for PR #89 (P67-P70)
