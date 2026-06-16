# Analysis 41 - Provide a way to remove non-empty scope overrides

## Decision: Valid — fix applied

`applySettings` already cleared a key when the form sent `''`, `null`, or an empty object, but enum
selects and boolean checkboxes always submitted a concrete value (`'safe'`, `true`, etc.), so once a
Workspace override existed for `launch.method`, `safetyMode`, `shell`, `transport.mode`, `allowAllDirs`,
or `debug`, the form could not remove it — selecting the apparent default just persisted another
Workspace value. Added an explicit `Inherit` state to every such control: enum selects gained an
`<option value="">Inherit</option>` first entry, and the two boolean checkboxes (`allowAllDirs`, `debug`)
were converted to tri-state selects matching the existing `enableTruncation`/`enableLogResources`
pattern. The form's collect path maps Inherit → `null` (booleans) or `''` (enums), which `applySettings`
already turns into `undefined`, clearing the value at the target scope so the next read falls back to
the other scope. `updateLaunchRows`/`updateTransportRows` now treat `''` as "no method/mode selected"
and hide the dependent rows, so the Inherit state is not confused with a real selection.

**Why:** The form edits one scope at a time, so without an Inherit control every enum/boolean it touches
becomes a permanent override — the documented "edit one scope without leaking the other" contract
(round-2 P6, round-4 P29) is broken the moment the user tries to undo a previous change. Adding Inherit
to the existing select/tri-state controls is the smallest change that closes the gap consistently,
reuses the `'' → clear` plumbing already in `applySettings`, and avoids inventing a new per-field reset
button (which would have been a larger UX redesign). The form's defaults-loaded behavior is unchanged:
`readSettingsForScope` still returns concrete defaults when no override exists, so users only see
Inherit when they explicitly choose it.

**Commit:** dea9217 — fix(vscode): address Codex round-5 review feedback for PR #86
