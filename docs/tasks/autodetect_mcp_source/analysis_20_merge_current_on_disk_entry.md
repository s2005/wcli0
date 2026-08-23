# Analysis 20 - Detect stale wcli0 entry changes before saving

## Decision: Valid — fix applied

`writeMcpJsonFromSettings` now keeps the form-generated fields separately and, at the write
step, merges them onto the CURRENT on-disk `servers.wcli0` entry (re-read into `existing`)
rather than the snapshot loaded into the panel. It falls back to the loaded `baseEntry`
when no entry is on disk. Other servers are still preserved as before.

**Why:** Merging onto the stale `loadedFileEntry` discarded external additions made to the
same entry after it was loaded (new `headers`/`envFile`/`oauth`). Merging onto the current
on-disk entry preserves those unmodeled additions while the user's form edits still win for
modeled fields. Covered by a unit test that edits the on-disk entry after the load snapshot
and asserts the external `headers` survive the save.

**Commit:** 3eccda7 — fix(vscode): address review feedback for PR #89 (round 3)
