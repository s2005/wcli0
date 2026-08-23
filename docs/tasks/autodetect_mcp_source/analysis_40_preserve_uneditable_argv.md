# Analysis 40 - Preserve current uneditable argv settings on file saves

## Decision: Valid — fix applied

For a file-source stdio save the whole `args` array is regenerated from
`buildLaunchSpec(settings)`, where `settings` overlays the form's editable
changes onto the snapshot loaded when the panel opened. The argv-derived fields
the form does not edit (`customArgs`, `blockedCommands`/`blockedArguments`/
`blockedOperators`, `maxReturnLines`, `transportAllowedOrigins`, `extraArgs`)
therefore come from that stale snapshot, so an on-disk addition made by another
editor after load (e.g. `--blockedCommand rm`) is dropped on an unrelated save.
The fix re-reads the current on-disk entry once (sharing the single read with
the P37/P41 changes) and re-parses it, then copies every uneditable argv-derived
field from the on-disk parse onto `settings` before `buildLaunchSpec` — the
args-equivalent of P23 (which already sources `env` from the on-disk entry).

**Why:** The file is the source of truth for fields the form cannot edit; the
save must carry forward whatever is on disk rather than a stale snapshot. This
extends the P20/P23 on-disk-merge discipline to the regenerated `args`.

**Proposed fix:** In `writeMcpJsonFromSettings`, parse the on-disk
`servers.wcli0` and copy its `customArgs`/blocked lists/`maxReturnLines`/
`transportAllowedOrigins`/`extraArgs` onto the settings used to build the spec.

**Commit:** ceefe56 — fix(vscode): round-6 codex review follow-ups for PR #89 (parser + save round-trip)
