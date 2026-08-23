# Analysis 43 - Keep scanning after ambiguous launcher-only flags

## Decision: Valid — fix applied

For a non-wcli0 (wrapper) command, `serverFlagSuffixStart` returned the smallest
index whose remaining tokens form a pure server-flag run, and the call site then
forced the split to `args.length` whenever that index was `0`. With a valueless
wrapper flag before the modeled flags — `wrapper --no-cache --shell bash` — the
whole argv parses as a pure run from index 0 (`--no-cache` is accepted as a leading
extraArg-style flag, then `--shell` consumes `bash`), so the index-0 guard stranded
`--shell bash` in `customArgs`; the form showed the default shell and a shell edit
appended a SECOND `--shell` instead of replacing the existing one. The fix passes
`allowIndexZero` into `serverFlagSuffixStart` (true only when the command IS the
wcli0 binary) and starts the scan at index 1 for wrapper commands, so the leading
ambiguous token stays in the launcher portion while the scan still finds the LATER
modeled-flag suffix.

**Why:** The index-0 guard for `P-wrapperflags` correctly refuses to trust an
index-0 boundary for a wrapper command (`mywrapper --transport fast` is the
wrapper's option, not wcli0's), but giving up entirely also discarded a legitimate
later suffix. Scanning from index 1 keeps the `P-wrapperflags` safety (a flag-only
run with no later modeled suffix still stays whole) while recovering modeled flags
that follow a leading wrapper flag, exactly as `P15`/`P42` already do when a
launcher positional separates them.

**Proposed fix:** Parametrize `serverFlagSuffixStart(args, allowIndexZero)` to begin
the scan at `allowIndexZero ? 0 : 1`, pass `isWcli0Command(command)`, and remove the
separate `start === 0` guard at the call site.

**Commit:** 3c4a087 — fix(vscode): round-7 codex review follow-ups for PR #89 (parser + save round-trip)
