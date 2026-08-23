# Analysis 109 - Preserve valueless array flags before later positionals

## Decision: Valid — fix applied

The array case of P106, and the more dangerous one. `node dist/index.js --allowedDir --debug C:/work`
gives yargs an EMPTY `allowedDir` array with `C:/work` left positional, so the server applies no
directory restriction at all. Re-emitted as `--debug --allowedDir C:/work`, the path becomes an
allowed directory — and `applyCliShellAndAllowedDirs` then switches `restrictWorkingDirectory` ON and
`enableInjectionProtection` OFF. An unrelated save silently rewrote the server's security posture in
both directions at once.

Handled by the same `makeExtrasReorderSafe` guard: a valueless array flag with a positional after it
is DROPPED rather than rewritten, because `--allowedDir=` would yield `['']` — the deny-all state of
P103 — while the valueless token is genuinely inert (the server's `length > 0` check ignores an empty
array, exactly as if the flag were absent). The positional itself still round-trips.

**Why:** Dropping an inert token is the only re-emission that preserves the launch, since yargs has
no spelling for "empty array" that survives being moved. The alternative — refusing the save —
would block every edit on such an entry to protect a token that does nothing. See
[[analysis_106_keep_valueless_scalar_before_positional]] and [[analysis_103_preserve_empty_allowed_dir]].

**Commit:** cd74db6 - fix(vscode): address the five P2 findings missed by the #89 merge (P106-P110)
