# Analysis 22 - Toggle the dirty indicator on edits

## Decision: Valid — fix applied

The `#dirtyMsg` span existed but was never toggled: `reflectDirty` only flipped the
Revert button's `disabled` state, so the promised "Unsaved changes" indicator never
appeared. `reflectDirty` now also toggles `#dirtyMsg`, showing it only when the form is
dirty AND the active source is `.vscode/mcp.json` (the settings source has its own
per-scope Save affordances). Because `reflectDirty` runs on every field edit (delegated
input/change listeners) and on every reload/save via `setActiveSource`, the indicator
clears correctly on save, revert, and source switches.

**Why:** The reviewer correctly identified dead UI. Scoping the indicator to the file
source matches the original intent (the dirty/Revert affordances are file-source-only)
and keeps the settings flow unchanged. Covered by client-side DOM tests P22 in
webviewButtons.test.cjs (shown when a file form is dirty; hidden on the settings source).

**Commit:** baf060b — fix(vscode): address review feedback for PR #89 (round 4)
