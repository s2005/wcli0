# Analysis 110 - Reject incompatible concurrent launch-method changes

## Decision: Valid — fix applied

P80 rebased a file save onto the CURRENT on-disk entry so concurrent edits are not overwritten, and
P95 refused the save when the entry moved between the two reads. Both left one incompatibility
unguarded: a concurrent change of the LAUNCH METHOD. Each method owns different fields, so an edit
made against the old one cannot be overlaid onto the new entry — a `launch.packageSpec` edit made
while the panel showed npx, overlaid onto a freshly parsed `node` entry, produces a node launch that
ignores `packageSpec` entirely. The save reported success and the edit vanished on reparse.

The handler now refuses when the on-disk launch method differs from the loaded one AND the submitted
values contain a method-specific field (`launch.packageSpec`, `launch.nodeScriptPath`,
`launch.customCommand`), unless the user is switching the method themselves. An unrelated edit still
merges onto the new entry, and a deliberate switch still wins.

**Why:** This is the transport-mode guard (P80) one level down, and the same reasoning applies:
where two models are disjoint, a merge has no defensible answer, so the honest outcome is to refuse
and ask for a reload. Keying the refusal on the submitted field names rather than on the settings
diff avoids false positives, exactly as the P55 guard does. See
[[analysis_80_preserve_concurrent_modeled_args]] and [[analysis_95_single_snapshot_for_file_saves]].

**Commit:** cd74db6 - fix(vscode): address the five P2 findings missed by the #89 merge (P106-P110)
