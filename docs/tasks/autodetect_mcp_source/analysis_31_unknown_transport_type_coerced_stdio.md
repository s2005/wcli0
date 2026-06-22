# Analysis 31 - An unrecognized transport `type` is silently rewritten to stdio on save

## Decision: Valid — fix applied

`parseMcpEntry` reads `const type = asString(entry.type) || 'stdio'` and then
checks `if (type === 'http' || type === 'sse')` case-sensitively. Any other
non-empty value (`'HTTP'`, `'websocket'`, a typo, or a future transport) falls
through to the stdio branch, sets `transportMode = 'stdio'`, and emits no note.
On save, `mergeEntryOntoBase` deletes `type` (present in both
`STDIO_OWNED_KEYS` and `HTTP_OWNED_KEYS`) and writes the generated type
(`'stdio'`, or `'http'`/`'sse'`), so the original type is overwritten. An
uppercase-`HTTP` entry that carries only a `url` is even worse: it parses as a
stdio entry with an empty command, so the save is blocked by validation and the
form misleads the user into thinking the entry is a broken stdio launch rather
than an http server.

**Why:** This violates the preserve-or-warn discipline the round trip already
applies to values the form cannot fully model (verbatim URLs in P5/P8/P10, raw
env in P9). The `type` field is a single authoritative token; silently coercing
it corrupts the entry on a no-op save.

**Proposed fix:** Either match `type` case-insensitively for `http`/`sse`, or —
preferred for forward-compat — when `entry.type` is a non-empty value other than
`stdio`/`http`/`sse`, emit a note and have the file-source save preserve the
original `type` verbatim (skip regenerating it, or refuse the save like P29).
Related: [[analysis_30_transport_flags_corrupt_stdio_entry]].

**Commit:** ceefe56 — fix(vscode): round-6 codex review follow-ups for PR #89 (parser + save round-trip)
