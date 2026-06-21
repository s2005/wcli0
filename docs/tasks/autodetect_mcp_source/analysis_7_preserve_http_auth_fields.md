# Analysis 7 - Preserve HTTP/SSE auth fields when saving

## Decision: Valid — fix applied

`writeMcpJsonFromSettings` now takes the loaded raw entry (`opts.baseEntry`) when saving a
file source and merges the regenerated `{ type, url }` onto it via `mergeEntryOntoBase`
instead of replacing the whole entry. Keys the form does not model (`headers`, `oauth`,
and any other VS Code-supported HTTP/SSE field) are carried through; only the form-owned
keys for the current transport mode are rewritten and the opposite mode's keys removed.

**Why:** Rebuilding the entry from scratch dropped authentication/configuration metadata on
any unrelated edit, so a remote MCP server could stop connecting after a load/save round
trip. Merging preserves those fields. Covered by a unit test asserting `headers`/`oauth`
survive a file save and a webview-path test asserting `headers` survive `saveToFile`.

**Commit:** 87784c3 — fix(vscode): address review feedback for PR #89 (round 2)
