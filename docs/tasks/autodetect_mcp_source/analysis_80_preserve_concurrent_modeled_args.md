# Analysis 80 - Preserve concurrent changes to unchanged modeled arguments

## Decision: Valid — fix applied

A file-source save built its settings as `overlaySettings(loadedFileSettings, msg.values)` — the
panel's load-time snapshot with the user's changed fields laid over it — and
`writeMcpJsonFromSettings` then refreshed only the argv fields that have no form control
(`customArgs`, blocked lists, `--maxReturnLines`, allowed origins, `--wslMountPoint`, `extraArgs`,
P40). Every MODELED field therefore came from the stale snapshot, and because `buildLaunchSpec`
regenerates the whole `args` array, a Debug-only save silently rewrote a `--shell bash` another
editor had written after the panel loaded back to the loaded `--shell cmd`.

The fix moves the baseline to the CURRENT entry: the `saveToFile` handler re-reads
`.vscode/mcp.json` (`readWcli0Entry`) and overlays `msg.values` onto that fresh `parseMcpEntry`
result, falling back to the loaded snapshot when nothing usable is on disk (a deleted or malformed
entry, matching the P23 merge-base fallback). Because `collectChanged()` submits exactly the fields
the user edited, this is a real three-way merge: submitted fields keep the user's value, every
other modeled field tracks disk. A concurrent transport-mode switch is refused instead of merged —
the two modes model disjoint field sets, so overlaying stdio edits onto an http entry (or the
reverse) cannot be meaningful — unless the user is switching the mode themselves. The write-time
carry-forward in `commands.ts` is kept as-is: it re-reads at the last moment (after the modals) and
still owns the fields with no form control.

**Why:** "Last writer wins for what you touched, disk wins for what you did not" is the rule the
file source already applies to env (P23) and to every uneditable argv field (P40); modeled fields
were simply the gap. Keying the merge off the submitted changed-field names rather than diffing
settings avoids false positives from representation differences, exactly as the P55 guard does.
Refusing on a concurrent mode switch is the "reject the stale save" half of the review's suggestion,
applied only where a merge has no defensible answer. See [[analysis_23_preserve_on_disk_env]] and
[[analysis_55_refuse_stale_network_field_edits]].

**Commit:** e7a73ce - fix(vscode): round-16 codex review follow-ups for PR #89 (P79-P82)
