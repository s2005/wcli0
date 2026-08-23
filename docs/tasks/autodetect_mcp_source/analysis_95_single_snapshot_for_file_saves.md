# Analysis 95 - Use the same snapshot for overlaying and writing file edits

## Decision: Valid — fix applied

P80 fixed the stale-baseline bug by re-reading the entry in the `saveToFile` handler and overlaying
the submitted changes onto that fresh parse. But the writer takes its OWN full-file snapshot (P69,
deliberately, so the file's other servers cannot be lost to a concurrent delete/recreate), so two
reads exist. A write landing between them produces the worst pairing: modeled fields derived from
the older entry, merged onto the newer one. A Debug-only save would then have written back the older
`--shell cmd` over a concurrent `--shell bash` — the exact overwrite P80 set out to prevent, in a
narrower window.

The handler now passes `expectedEntryJson` — the serialized entry its settings were overlaid on —
and the writer refuses when its own snapshot does not match, reporting that the file changed and
that nothing was written. Agreement, including both reads finding no entry, proceeds as before, so
the deleted-entry recreate path (P23) still works.

**Why:** Of the review's two options, rejecting fits this codebase where passing the snapshot does
not: the writer needs the WHOLE file (for the other servers), not just the entry, and it must read
that itself to keep the P69 guarantee. Comparing what the caller assumed against what the writer
found gives the same safety without weakening P69, and the race is rare enough that asking for a
reload costs nothing. See [[analysis_80_preserve_concurrent_modeled_args]] and
[[analysis_69_file_source_single_snapshot]].

**Commit:** bfa5c70 - fix(vscode): round-20 codex review follow-ups for PR #89 (P93-P97)
