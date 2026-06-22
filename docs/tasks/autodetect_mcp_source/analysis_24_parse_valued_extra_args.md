# Analysis 24 - Parse custom suffixes with valued extraArgs

## Decision: Valid — fix applied

`isPureServerFlagRun` rejected any run containing a bare (non-dash) token, so a custom
suffix ending in a valued extraArg such as `--futureFlag x` was disqualified and
`serverFlagSuffixStart` mis-split the modeled flags (`--shell cmd`) into the launcher
args. The fix consumes a trailing bare token as the preceding unrecognized flag's value:
when the bare token is the LAST token of the run it is the value of a valued extraArg, so
the run stays pure; a bare token with more tokens after it is still treated as a launcher
positional and disqualifies the run.

**Why:** The forward builder emits `[...launcherArgs, ...modeledFlags, ...extraArgs]`, so
extraArg values appear at the tail while launcher positionals (uvx's package, `--` then
the command) appear before the modeled flags and are followed by them. The "trailing
only" rule is the precise discriminator that fixes P24 without regressing P15 (keep
wrapper options/positionals in the launcher) or P17 (`npx --package=x -- wcli0 ...`).
Covered by configSource.test.cjs P24 (trailing valued extraArg parses; non-trailing bare
token stays a launcher positional).

**Commit:** 7d5c8e2 — fix(vscode): address review feedback for PR #89 (round 4)
