# Analysis 37 - The env source and the merge base come from two separate file reads straddling the env-prompt modal

## Decision: Valid — fix applied

For a file-source stdio save, `writeMcpJsonFromSettings` calls
`readWcli0Entry(folder)` (commands.ts:516) to source the round-tripped `env`,
then awaits the Include/Omit `showWarningMessage` modal (lines 523-535), then
`readFile`s the whole file again (line 576) to build `existing` and the
`servers.wcli0` merge base (lines 633-636). An external change to
`.vscode/mcp.json` during that modal makes the two reads disagree. If env was
added in between, the prompt counted only the first read's keys and the merge
deletes the second read's newer env (env is a form-owned stdio key) — a silent
loss exactly like the one P23 fixed, re-opened by the split read. If the file is
deleted between the reads, `readFile` throws `FileNotFound`, `existing` becomes
`{}`, the merge falls back to `baseEntry`, and the write recreates the file with
only `servers.wcli0`, losing every other server that was present at the first
read, with no warning.

**Why:** A save must operate on a single consistent snapshot of the file it is
merging into. P20/P23 established that the on-disk entry is the source of truth
for the merge base and for env; reading it twice across a user-facing modal
breaks that invariant under concurrent edits.

**Proposed fix:** Read the file once at the top of the function, parse it once,
and derive both the env (the current `servers.wcli0.env`) and the merge base
(`servers.wcli0`) from that single parsed object — eliminating the second
`readFile`/`readWcli0Entry` and the window between them.

**Commit:** ceefe56 — fix(vscode): round-6 codex review follow-ups for PR #89 (parser + save round-trip)
