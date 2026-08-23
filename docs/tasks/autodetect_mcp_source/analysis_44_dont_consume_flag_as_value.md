# Analysis 44 - Do not consume another flag as a missing option value

## Decision: Valid — fix applied

The space-separated value branch in `parseServerArgs` consumed the next token as a
value option's value even when that token was another flag. For
`--blockedCommand --debug`, yargs parses `blockedCommand=[]` plus `debug=true`, but
the parser modeled `blockedCommands=["--debug"]` and dropped `debug`; a no-op save
then re-emitted `--blockedCommand=--debug`, silently changing the server behavior.
The fix consumes the next token as the value ONLY when it does not start with `-`;
when the next token is another flag the value option is preserved verbatim in
`extraArgs` and the following flag is parsed on the next iteration.

**Why:** This mirrors `argsBuilder.stripConfigArgs` (P86), which already refuses to
swallow a following option as a value, and matches yargs' own behavior. Preserving
the bare option in `extraArgs` round-trips it (`--blockedCommand` re-emits as an
empty blocked-command list) while the unrelated flag survives, so a load/save cycle
no longer corrupts the entry.

**Proposed fix:** Add `&& !args[i + 1].startsWith('-')` to the space-separated
value-option condition; the existing fall-through pushes the option to `extraArgs`.

**Commit:** 3c4a087 — fix(vscode): round-7 codex review follow-ups for PR #89 (parser + save round-trip)
