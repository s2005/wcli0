# Analysis 55 - Refuse stale edits before locking network file fields

## Decision: Valid — fix applied

The `saveToFile` handler now refuses a file-source save when the resolved transport mode
is `http`/`sse` and `collectChanged()` carries any key other than `transport.mode`,
`transport.host`, or `transport.port`. A network entry stores only `{type, url}`, so any
other submitted field (safety, config file, launch command, limits, per-shell, profiles)
is an unsaved edit the post-write reparse would silently drop behind a misleading "Saved".
The guard surfaces a clear error and writes nothing; a pure transport edit (host/port/mode)
still saves, and a clean stdio->http switch still succeeds.

**Why:** `applyFileTransportLock` only disables the non-transport controls visually; it does
not discard edits already made while the entry was stdio, and `collectChanged()` still
submits them. The fix keys off the submitted changed-field names (the authoritative record
of the user's edits), so there are no false positives from settings-representation
differences. This complements the existing host-side guards (P29/P49/P54/P-httpshells/
P-maskfile) in `writeMcpJsonFromSettings`, which remain as defense in depth for the
shells/profiles/mask subset and the settings-export path. See [[analysis_29_refuse_unsavable_file_edits]]
and [[analysis_49_disable_masks_for_file_sources]].

**Commit:** 3727aec - fix(vscode): round-9 codex review follow-ups for PR #89 (P55/P56)
