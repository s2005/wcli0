# Analysis 101 - Revalidate the file after save-time prompts

## Decision: Valid — fix applied

P69 made the save take ONE full-file snapshot up front so a concurrent delete/recreate could not
drop the file's other servers. But that snapshot is taken before the awaited modals — the
environment prompt and the JSONC-comment warning — so a write landing while a prompt is open was
serialized away: the file went back to its pre-modal contents, including any other server the
concurrent editor had changed. P95 closed the equivalent gap between the webview read and the
snapshot; this is the same race one stage later, and the wider one, because it can discard edits to
entries this form never touches.

The save now re-reads the file immediately before writing and compares the raw bytes with the
snapshot it serialized from; a mismatch (an edit, or a delete) reports that the file changed and
writes nothing.

This deliberately supersedes the write-anyway half of P69 and P46, and their tests were updated to
the new contract. Their actual guarantees are intact and are now met more strictly: P69 asked that
a concurrent delete never drop the other servers — refusing writes nothing at all, so nothing is
dropped and the deleted file is not resurrected either; P46 asked that a stale generated env never
be merged onto a freshly re-read base — there is no merge, and the external edit survives untouched.
A save on an unchanged file is unaffected.

**Why:** Byte comparison is the strongest check available through the `vscode.workspace.fs` API
(there is no ETag or document version for a file this extension does not open as a TextDocument),
and it is strictly conservative: it can only refuse a save, never corrupt one. Refusing is also the
honest outcome — the alternative, re-merging onto the newer file, would silently re-run every
preservation decision against content the user never saw. See
[[analysis_69_file_source_single_snapshot]], [[analysis_46_merge_from_single_snapshot]] and
[[analysis_95_single_snapshot_for_file_saves]].

**Commit:** f03b33f - fix(vscode): round-23 codex review follow-ups for PR #89 (P100-P102)
