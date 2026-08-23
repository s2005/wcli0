# Analysis 35 - The P29 refusal is nested inside the stdio branch, so http/sse file sources silently drop shells/profiles

## Decision: Valid — fix applied

`writeMcpJsonFromSettings` opens `if (settings.transportMode === 'stdio')` at
commands.ts:365, and the P29 refusal (line 389), the no-config-file guard
(line 406), and the sync warning (line 426) all live inside it. The http/sse
`else` branch (line 464) only validates the port and writes `{ type, url }`
(plus preserved `headers`/`oauth`). So a file source set to http/sse that also
carries per-shell settings or environment profiles is never refused: those values
cannot be expressed in an http/sse entry (no `--config`, no shells/profiles
keys), so they are silently dropped while the save reports success. This is the
same unsavable-edit class as P29, just unguarded for the non-stdio modes.

**Why:** P29's intent was "a file save must not silently drop per-shell/profile
edits it cannot persist." Nesting the guard under stdio leaves the http/sse
modes uncovered, so the protection is incomplete. The provider does launch over
http/sse with profiles honored, so the dropped values are real.

**Proposed fix:** Hoist the `fileSource && (hasPerShellConfig(settings) ||
hasProfilesConfig(settings))` refusal (or a transport-aware variant) above the
stdio/http branch split so it covers every file-source save. Pair with
[[analysis_36_p29_bypass_ignore_mask]] (the mask bypass) since both are gaps in
the same gate.
**Resolution:** Implemented in PR #89 round 6: the refusal was hoisted above the
stdio/http split in `writeMcpJsonFromSettings`, so an http/sse file source with
shells/profiles is now refused too (commands.ts, the `fileSource &&
(hasRawPerShellConfig || hasRawProfilesConfig)` guard).

**Commit:** ceefe56 — fix(vscode): round-6 codex review follow-ups for PR #89 (parser + save round-trip)
