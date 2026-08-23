# Analysis 61 - Strip preserved value flags when replacing them

## Decision: Valid — fixed

`buildServerArgs` (argsBuilder.ts) preserves unrecognized/diverted tokens via `extraArgs`
and appends them verbatim after the typed flags. The parser (`parseServerArgs`,
configSource.ts) diverts a modeled option into `extraArgs` in two cases: a numeric value the
typed field cannot faithfully hold (`divertNumber`: an unparseable `--commandTimeout bad`,
P34; or an out-of-range log limit, P59), and a value that is itself a flag
(`--logDirectory --debug`, where the space-separated branch refuses to consume the next
token and preserves the flag alone). In both cases the modeled flag token survives in
`extraArgs`. The builder's duplicate-cleanup only stripped `--maxOutputLines` /
`--maxReturnLines`, so when the user then set `commandTimeout`, `logDirectory`, `shell`,
`initialDir`, `maxCommandLength`, `wslMountPoint`, or a transport host/port/origin in the
form, the save emitted the typed flag AND the stale diverted copy. The server's yargs
(`src/index.ts`) parses a repeated scalar option as an array, while `applyCliSecurityOverrides`
/ `applyCliLogging` / `applyCliTransport` expect a number/string — so the edited value is
ignored or crashes startup instead of replacing the bad argument.

**Why:** A save must let the form value win over a diverted/preserved copy of the same
modeled scalar flag (invariant: the typed field is authoritative once set). This is the same
class as P59, which only solved it for the two log-limit fields; the concern correctly
generalizes it to every modeled SCALAR value flag the builder emits. Array options
(`--allowedDir`, `--blockedCommand/Argument/Operator`) are intentionally exempt: the server
merges repeated values, so a preserved duplicate is harmless rather than an array-coercion
hazard. See [[analysis_59_allow_out_of_range_log_limits]].

**Fix applied:** the post-build duplicate-cleanup in `buildServerArgs` now strips every
modeled scalar value flag it actually emitted — `--shell`, `--initialDir`/`--initial-dir`,
`--commandTimeout`/`--command-timeout`, `--maxCommandLength`/`--max-command-length`,
`--wslMountPoint`/`--wsl-mount-point`, `--maxOutputLines`/`--max-output-lines`,
`--maxReturnLines`/`--max-return-lines`, `--logDirectory`/`--log-directory`, and the emitted
transport host/port/origin flag — from `extraArgs` via `stripValueFlag`. Each strip is guarded
by the SAME emit condition (captured into `emitShell`/`emitCommandTimeout`/etc. booleans and
the `emittedTransportScalarFlags` list) so an UNSET field still round-trips its preserved
malformed value verbatim. Both the camelCase and kebab-case spellings the parser produces are
stripped. Unit tests added in `argsBuilder.test.cjs` (P61).

**Commit:** 65e018d — fix(vscode): round-11 codex review follow-ups for PR #89 (P61-P62)
