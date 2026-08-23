# Analysis 74 - Stop parsing args after the `--` separator

## Decision: Valid — fix applied

`parseServerArgs`' main loop pushed a bare `--` to `extraArgs` but kept iterating, so any tokens
after the separator were still matched against the boolean/value-option branches. yargs-parser
treats every token after `--` as a positional, so a hand-authored `node dist/index.js -- --shell
cmd` (or the npx/node fast paths, whose `serverArgs` slice can contain the separator) was loaded as
`shell=cmd`. The form then showed an active shell and a no-op save re-emitted `--shell cmd` as a
real flag, changing how the server launched.

The fix adds a `token === '--'` guard at the top of the loop body: it copies the separator and the
entire remainder into `extraArgs` verbatim and breaks out of parsing. Flags before the separator are
still modeled normally; only the post-`--` tokens are preserved untouched.

**Why:** Matching yargs' positional semantics is the only faithful round-trip. Preserving the
remainder verbatim guarantees a no-op save reproduces the original argv exactly, instead of
promoting positionals to active wcli0 flags. This mirrors the existing "preserve what cannot be
faithfully modeled" approach used for unknown flags and out-of-range values. The complementary
suffix-detector fix is P75 (a `--` in a custom launcher's args is handled before parseServerArgs is
even reached).

**Commit:** bb6fe6c — fix(vscode): round-15 codex review follow-ups for PR #89 (P74-P78)
