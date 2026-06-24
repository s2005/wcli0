# Analysis 64 - Preserve ignored security-limit values instead of blocking saves

## Decision: Valid — fix applied

`divertNumber` diverted unparseable numbers (P34) and out-of-range log limits
(P59) to `extraArgs`, but returned false for any finite `commandTimeout`/
`maxCommandLength`, so a loaded `--commandTimeout 0` or `--maxCommandLength=-1`
was modeled into the typed field. The form's number input rejects a negative and
`validateLaunchSpec` blocks any value `<= 0` (non-managed), so the entry could
never be saved again — even for an unrelated edit. The fix extends `divertNumber`
to return true for non-positive `commandTimeout`/`maxCommandLength`, so these
values round-trip verbatim through `extraArgs` instead of stranding the form.

**Why:** The server ignores a non-positive `commandTimeout`/`maxCommandLength`
and runs on its default (it never lowers the limit for such a value), so the
loaded entry is valid to the server even though the form cannot represent it.
Diverting it matches the existing treatment of other unrepresentable numerics:
the field stays at its default (`null`), `buildServerArgs` does not emit the flag
(its `> 0` guard), and the preserved token survives a save. If the user later
sets a positive value in the form, `buildServerArgs` emits it and `stripValueFlag`
removes the stale preserved copy, so the edit wins.

**Commit:** 18dc478 — fix(vscode): round-12 codex review follow-ups for PR #89 (P63-P66)
