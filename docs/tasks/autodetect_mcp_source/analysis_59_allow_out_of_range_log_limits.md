# Analysis 59 - Don't refuse file-source saves over an out-of-range CLI log limit

## Decision: Valid — fix pending

For a file-source save, `writeMcpJsonFromSettings` validates with `managed = false`
(commands.ts:550). `validateLaunchSpec`'s `maxReturnLines` and `maxOutputLines` checks
(argsBuilder.ts:1015-1026) apply the config-file bound (1..10000, integer for `maxReturnLines`)
UNCONDITIONALLY — ignoring `managed`, unlike the `commandTimeout`/`maxCommandLength` checks just
below them, which are managed-aware (argsBuilder.ts:1033-1053). A loaded stdio entry carrying
`--maxReturnLines 50000` is modeled into the typed field as `50000` (finite, so P34's
unparseable-value route does not divert it), `overlaySettings` preserves it on any unrelated
edit (it has no `FIELD_TO_PROP` form control), and the save is refused with a message claiming
the server rejects it at startup. Because `maxReturnLines` has no control anywhere in the form,
the user cannot fix it — every panel save of the entry is stranded.

The refusal's premise is wrong for the CLI/mcp.json launch. The server runs
`validateLoggingConfig` only inside `loadConfig` (on the file/default config), BEFORE the CLI
override; `applyCliLogging` (src/index.ts runs it after `loadConfig`) then applies any
`maxReturnLines > 0` with no upper-bound/integer check and no re-validation, and the `CLIServer`
constructor does not re-validate. So `--maxReturnLines 50000` runs with 50000 and
`--maxReturnLines 0` is ignored (default 500) — both server-valid. The 1..10000-integer bound is
correct only for the managed/config-file emission path, where the value is written into a config
file that `validateLoggingConfig` re-checks.

**Why:** A hand-authored, server-valid numeric flag the form cannot edit must round-trip, not
block unrelated saves. This is the wrongful-refusal/stranded-save class behind P34 (route a
problematic numeric value to `extraArgs`) and P50 (recover an out-of-range port), but neither
covers it: P34 fires only for non-finite values, and P50's recovery is specific to the transport
port (which has a form control and a verbatim-URL recovery path). P58 is the client-side
counterpart (the `min`/`max` inputs) for the fields that DO have a control; this is the
host-side `validateLaunchSpec` refusal for `maxReturnLines`, which has none. See
[[analysis_34_invalid_numeric_blocks_save]] and [[analysis_40_preserve_uneditable_argv]].

**Proposed fix:** Make the `maxReturnLines` / `maxOutputLines` range checks managed-aware (skip
the 1..10000 block on the non-managed CLI/file path, matching `commandTimeout`/`maxCommandLength`),
OR route a finite-but-out-of-range modeled value to `extraArgs` at parse time (mirroring P34) so
it round-trips verbatim and bypasses `validateLaunchSpec`. Note the secondary loss: even past
the refusal, `buildServerArgs` (argsBuilder.ts:405-407) drops an out-of-range `maxReturnLines`
via the same `isValidLogLimit` gate, so the P40 carry-forward would still lose it — the parse-time
`extraArgs` route avoids both. Add a round-trip test for `--maxReturnLines 50000`.

**Commit:** (pending)
