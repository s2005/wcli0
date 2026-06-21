# Analysis 19 - Drop stale transport-only fields when changing modes

## Decision: Valid — fix applied

`mergeEntryOntoBase` now removes the OTHER transport mode's ENTIRE field set on a mode
switch, using `STDIO_FIELD_KEYS` (adds `envFile`/`dev`/`sandboxEnabled`) and
`HTTP_FIELD_KEYS` (adds `headers`/`oauth`) rather than only the form-owned keys. Staying in
the same mode still preserves that mode's unmodeled fields (P7/P12).

**Why:** The previous lists only removed `url` or `command`/`args`/`cwd`/`env`, so an HTTP
entry's `headers`/`oauth` survived into a stdio server (and stdio's `envFile`/`dev` into an
HTTP server) after a mode change. Removing the other mode's whole field set fixes the leak.
Covered by unit tests for both switch directions.

**Commit:** 3eccda7 — fix(vscode): address review feedback for PR #89 (round 3)
