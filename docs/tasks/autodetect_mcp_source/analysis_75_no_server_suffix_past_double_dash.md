# Analysis 75 - Do not scan past `--` for a server suffix

## Decision: Valid — fix applied

`serverFlagSuffixStart` scans for the start of the contiguous wcli0 server-flag suffix.
`isPureServerFlagRun` correctly disqualifies a run that *starts* with `--`, but the scan loop simply
advanced to the next index, so for `command: "wcli0", args: ["--", "--debug"]` it found a valid run
at index 1 and split there. The wcli0 binary's own `--` is an options separator: yargs leaves
`--debug` positional, so modeling it (and re-emitting it as an active flag on save) was wrong.

The fix stops the scan when it reaches a `--`, but only when the command IS the wcli0 binary
(`allowIndexZero`). That scoping is essential: for a wrapper command a `--` is a pass-through
separator before the wrapped binary, and the wrapped wcli0's flags legitimately follow it — e.g.
`npx --package=wcli0 -- wcli0 --shell cmd`, where `--shell` must still be modeled (the P17 case). So
the break is correct for the binary's own separator and intentionally skipped for a wrapper's.

**Why:** Only the wcli0 binary's own `--` makes the remainder positional; a wrapper's `--` delegates
to the wrapped program, which then parses its own flags. Scoping the break to `allowIndexZero`
fixes the reviewer's direct-entry case without regressing the npx/uvx pass-through behavior that the
existing P17 test locks in (this was caught by that test during implementation).

**Commit:** bb6fe6c — fix(vscode): round-15 codex review follow-ups for PR #89 (P74-P78)
