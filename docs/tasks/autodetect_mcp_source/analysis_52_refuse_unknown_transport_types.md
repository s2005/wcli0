# Analysis 52 - Refuse saves for unknown transport types

## Decision: Valid — fix applied

An entry with a future/custom `type` such as `websocket` is parsed as stdio for its
editable fields, with a note that a save will normalize it (P31). But nothing blocked
the save: if the entry also had valid `command`/`args`, an unrelated edit went through
`mergeEntryOntoBase`, which removes the whole stdio field set (including `type`) from
the base and writes `type: 'stdio'` from the generated entry — silently coercing the
user's deliberately-chosen transport and dropping any URL-like fields.

The fix adds a host guard in `writeMcpJsonFromSettings`: for a file source whose current
on-disk (merge-base) entry has a `type` that is not stdio/http/sse (case-insensitive),
the save is refused with a message directing the user to edit `.vscode/mcp.json`
directly. The check uses the current on-disk entry (`urlBase`) so a type changed after
the panel loaded is still honored.

**Why:** The form genuinely cannot model the transport, so the only non-destructive
options are refuse or preserve; refusing is simplest and matches the existing note that
already tells the user to edit the file directly. Guarding on the merge base (not the
stale loaded snapshot) keeps the decision consistent with what the save would overwrite.

**Proposed fix:** Refuse a file-source save when the merge-base entry's `type` is not
stdio/http/sse.

**Commit:** 8be428b — fix(vscode): round-8 codex review follow-ups for PR #89 (file-source save round-trip)
