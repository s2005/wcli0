# Analysis 48 - Compare file source transport types case-insensitively

## Decision: Valid — fix applied

`preservedFileUrl` compared `settings.transportMode` to the loaded entry's RAW
`type` string. `parseMcpEntry` models an entry written as `HTTP`/`SSE` by lowercasing
the type, so `settings.transportMode` is already lowercase; a no-op save of an
uppercase entry therefore saw `"http" !== "HTTP"`, treated it as a transport-mode
switch, returned `undefined`, and rebuilt the URL to the canonical
`http://host:port/...` form — losing the custom-scheme/default-port/socket URL shape
the parser promised to preserve (P5/P8/P10). The fix lowercases `base.type` before the
comparison.

**Why:** The preservation decision must use the same normalized type the parser used
to model the entry; comparing the raw type makes case alone look like a mode change.
Lowercasing matches `parseMcpEntry`'s own `rawType.toLowerCase()` (P31).

**Proposed fix:** In `preservedFileUrl`, compute
`base.type.toLowerCase()` for the `baseType` comparison.

**Commit:** 3c4a087 — fix(vscode): round-7 codex review follow-ups for PR #89 (parser + save round-trip)
