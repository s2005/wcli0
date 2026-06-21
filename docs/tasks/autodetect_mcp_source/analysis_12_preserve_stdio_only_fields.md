# Analysis 12 - Preserve stdio-only VS Code fields when saving

## Decision: Valid — fix applied

The same `mergeEntryOntoBase` change used for HTTP/SSE applies to stdio: when saving a file
source, the regenerated `{ type, command, args, cwd?, env? }` is merged onto the loaded raw
entry, so VS Code-supported stdio fields the form does not model (`envFile`, `dev`,
`sandboxEnabled`, ...) are preserved. The opposite-mode key (`url`) is removed on a
stdio<->http switch.

**Why:** Rebuilding the stdio entry from scratch deleted those fields on any unrelated
edit, so env files stopped loading, dev mode was disabled, or sandboxing was turned off.
Merging preserves them. Covered by a unit test asserting `envFile`/`dev`/`sandboxEnabled`
survive a file save while the edited flag is still written, plus a mode-switch test that
asserts the stale `url` is dropped.

**Commit:** 87784c3 — fix(vscode): address review feedback for PR #89 (round 2)
