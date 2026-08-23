# Analysis 46 - Merge from a single file snapshot

## Decision: Valid — fix applied

A file-source save read the on-disk entry once up front (`onDiskEntry`) to supply the
env/argv/url preservation data, but the merge base was read AGAIN later from the
full-file read at the write step. Because validation and user-facing modals are
awaited between the two reads, an external edit landing in that window paired a fresh
merge base (the later read) with stale generated `args`/`env` (the up-front read),
producing an incoherent entry — e.g. the unmodeled `dev`/`headers` from the new read
kept while externally added env/flags were dropped. The fix merges onto the SAME
up-front snapshot (`onDiskEntry ?? baseEntry`) used for preservation, so the written
entry is a coherent view of one snapshot.

**Why:** The up-front read already captures an external edit made after the panel
loaded (so it still satisfies P20's goal of not merging onto the stale panel
snapshot); using a second, later read only for the merge base reintroduces a
split-snapshot hazard. Deriving the preservation data and the merge base from the
same parsed snapshot is the option the reviewer endorsed and the lowest-risk fix —
it eliminates the corrupting half-merge and keeps the result internally consistent
(last-writer-wins on the up-front snapshot).

**Proposed fix:** At the write-step merge, set the merge base to
`onDiskEntry ?? baseEntry` instead of re-extracting `servers.wcli0` from the later
full-file read.

**Commit:** 3c4a087 — fix(vscode): round-7 codex review follow-ups for PR #89 (parser + save round-trip)
