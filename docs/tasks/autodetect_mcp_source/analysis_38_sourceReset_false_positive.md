# Analysis 38 - `sourceReset` unconditionally arms the P28 flag, producing a false confirmation on a clean form

## Decision: Valid — fix applied

On a workspace-folder change, `wsSub` sends `post(true)` (an external init) and
then, only when the file source was reset, the `sourceReset` message
(webview.ts:561 then :567-568). The `sourceReset` handler sets
`resetFromFileSource = true` unconditionally (line 2017). For a DIRTY form the
external init is skipped by the dirty guard (line 2043-2044), so the flag is
correctly armed (P28: the form still holds file-derived values). But for a CLEAN
form the external init is applied: it re-baselines the form to real settings
values and clears `resetFromFileSource = false` (line 2054), and the
immediately-following `sourceReset` then sets it back to `true`. The form now
holds settings values against a settings baseline yet is flagged file-derived,
so the next "Save settings" posts `fromResetFileSource: true && isDirty()` and
trips the P28 modal — a false positive ("these values came from a .vscode/mcp.json
source that is no longer active..."). If the user trusts the warning and
declines, a legitimate settings edit is abandoned. The existing P28 test
(webviewButtons.test.cjs:281) dispatches `sourceReset` before a non-external init
on a dirty form — the reverse of the real ordering — so it does not cover this.

**Why:** `sourceReset` exists (P25) to switch a DIRTY form off a gone file
source; for a clean form the preceding external init already did that switch and
re-baselined. Arming the P28 flag regardless of whether the form still holds
file-derived values makes the guard fire on values that actually came from
settings.

**Proposed fix:** Gate the flag on the form still being dirty in the
`sourceReset` handler: `if (isDirty()) resetFromFileSource = true;`. A clean
form (just re-baselined by the external init, `isDirty() === false`) leaves it
cleared; a dirty form (init skipped) arms it, preserving P28.

**Commit:** ceefe56 — fix(vscode): round-6 codex review follow-ups for PR #89 (parser + save round-trip)
