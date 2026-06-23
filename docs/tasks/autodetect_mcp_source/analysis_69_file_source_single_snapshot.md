# Analysis 69 - Keep file-source saves on one file snapshot

## Decision: Valid — fix applied

A file-source save read `servers.wcli0` up front (for URL/env/argv preservation and
the merge base) and then reread the whole file at the write step, treating
`FileNotFound` as a fresh file. A concurrent delete/recreate of `.vscode/mcp.json`
during an intervening warning modal therefore made the write start from `{}` and
emit a file containing only `servers.wcli0`, silently dropping every other server
present in the originally loaded file. The fix takes one full-file snapshot up
front for a file source (extracted into a shared `readExistingMcpJson` helper that
also runs the malformed-root / non-object-`servers` guards) and reuses it for the
merge base, the other-servers container, and the comment-warning check; the
later re-read now runs only for the settings-driven export. The single snapshot
closes the window between the two reads.

**Why:** The merge base already had to come from one up-front snapshot to stay
coherent with the env/argv it derives (P46), and the same snapshot is the correct
source for the surrounding servers. Reusing it — rather than adding an abort path —
preserves the existing P20/P41/P46 behaviors (an external edit before the save is
still captured by the single up-front read) while guaranteeing that other servers
survive a delete during a modal. The settings-driven export keeps its single
bottom read, so its behavior is unchanged.

**Commit:** de5c856 — fix(vscode): round-13 codex review follow-ups for PR #89 (P67-P70)
