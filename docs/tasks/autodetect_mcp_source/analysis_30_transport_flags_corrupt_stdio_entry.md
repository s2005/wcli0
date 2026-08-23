# Analysis 30 - Transport flags in a stdio entry's args flip the type and delete command/args on save

## Decision: Valid — fix applied

`parseMcpEntry` derives `transportMode` from the entry `type` (stdio by default),
then calls `parseServerArgs` on the args and `Object.assign`s the parsed
settings over it. Because `--transport` is in `VALUE_OPTIONS`, a `--transport
http` flag in a stdio entry's args overwrites `transportMode` to `'http'`. On
save, `writeMcpJsonFromSettings` then takes the http/sse branch (the stdio
guard `settings.transportMode === 'stdio'` is false), generates `{ type, url }`,
and `mergeEntryOntoBase(..., 'http')` deletes the whole `STDIO_FIELD_KEYS` set
(`type`, `command`, `args`, `cwd`, `env`, `envFile`, `dev`, `sandboxEnabled`).
The launcher is gone and a default URL is written, with no prompt. The sibling
transport sub-flags (`--http-host`, `--http-port`, `--sse-host`, `--sse-port`,
the allowed-origins flags) are consumed into `transportHost`/`transportPort`/
`transportAllowedOrigins` but never re-emitted for stdio (the forward builder
only emits them in the non-stdio branch), so they are dropped on a no-op save.

**Why:** An mcp.json entry's `type` is authoritative — it selects stdio vs. an
http/sse `url` server. The reverse parser must not let a flag inside `args`
override it, and must not consume transport sub-flags it cannot re-emit for the
mode the `type` selected. This is the same preserve-the-authored-entry invariant
behind P5/P10 (preserve URLs the form cannot model) and P19 (drop only the
OTHER mode's fields).

**Proposed fix:** In `parseMcpEntry`, after parsing server args for a stdio
entry, drop any parsed `transportMode`/`transportHost`/`transportPort`/
`transportAllowedOrigins` (or never consume the `--transport`/`--http-*`/
`--sse-*` tokens for a non-http/sse entry) so they fall through to `extraArgs`
and round-trip verbatim, leaving `transportMode = 'stdio'`. Add a note when an
unusual transport flag is present in a stdio entry. No existing test covers the
save path here (configSource.test.cjs only asserts the parse direction).
Related: [[analysis_31_unknown_transport_type_coerced_stdio]].

**Commit:** ceefe56 — fix(vscode): round-6 codex review follow-ups for PR #89 (parser + save round-trip)
