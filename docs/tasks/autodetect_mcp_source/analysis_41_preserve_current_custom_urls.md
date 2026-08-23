# Analysis 41 - Preserve current custom URLs on file saves

## Decision: Valid — fix applied

`preservedFileUrl` decided whether to keep an http/sse entry's URL verbatim
against `baseEntry` — the snapshot captured when the panel loaded — even though
the merge step (P20) had already re-read the current on-disk entry. So an
external edit to an unmodeled part of the URL after load (scheme/path/default
port) was overwritten with the stale URL on the next save, as long as the modeled
host/port still matched the form. The fix makes the file-source URL preservation
use the CURRENT on-disk entry's `url` (from the single shared read) instead of
`baseEntry`, so a concurrent URL change survives when its modeled host/port are
unchanged — the URL twin of the P20 on-disk merge.

**Why:** Once the save re-reads the on-disk entry for the merge base (P20) and
for env (P23), the URL-preservation decision must use the same current snapshot,
or it silently reverts a legitimate concurrent edit.

**Proposed fix:** Pass the current on-disk entry to `preservedFileUrl` for a
file source (replacing `baseEntry`), reusing the single read.

**Commit:** ceefe56 — fix(vscode): round-6 codex review follow-ups for PR #89 (parser + save round-trip)
