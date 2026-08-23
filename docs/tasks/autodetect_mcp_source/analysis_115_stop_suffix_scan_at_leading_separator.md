# Analysis 115 - Stop wrapper suffix scanning at a leading separator

## Decision: Valid - fix applied

`serverFlagSuffixStart` started at index 1 so an index-0 flag run could not be mistaken for a wcli0
suffix (P-wrapperflags), but that also hid a `--` options separator sitting at index 0: for
`command: "node", args: ["--", "wrapper.js", "--debug"]` - where node treats `--` as the end of its
own options and hands `--debug` to the wrapper - the scan resumed at `--debug`, split it into the
server portion and showed it as wcli0's Debug setting, so clearing that setting saved
`["--", "wrapper.js"]` and deleted the wrapper's own option. The scan now visits index 0 and applies
the existing separator rules there (stop, unless the wcli0 binary itself follows, which proves the
P17 pass-through), while an index-0 FLAG run is still skipped, so no suffix can begin at index 0.

**Why:** The index-1 start was only ever about flag-run ambiguity, never about separators, so
splitting the two concerns restores the P75 rule for the one position it could not see rather than
weakening the P-wrapperflags guard. Handling the separator inside the same loop keeps a single
implementation of the pass-through exception instead of duplicating it in a pre-check. Tests pin
all three behaviors: the leading separator now round-trips verbatim, the P17
`npx -- wcli0 --shell cmd` pass-through still models the server flags, and `mywrapper --transport
fast` still keeps its own option in `customArgs`.

**Commit:** af0d21e - fix(vscode): address review feedback for PR #93 (P113-P115)
