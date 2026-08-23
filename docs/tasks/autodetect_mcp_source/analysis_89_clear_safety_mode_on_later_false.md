# Analysis 89 - Clear a prior safety mode when a later value is false

## Decision: Valid â€” fix applied

Both safety branches â€” the bare/space form and the attached assignment `applyAttachedBoolean` â€” set
`safetyMode` when the value was true and did nothing when it was false. That is only correct for a
single occurrence. For a repeat ending in false the earlier positive survived, so
`--unsafe --unsafe=false` (and `--unsafe --unsafe false`) loaded as `safetyMode: 'unsafe'` even
though the server runs with protections ON, and a no-op save then re-emitted a bare `--unsafe` â€”
turning a protected launch into an unrestricted one without the user touching anything. The negated
`--no-unsafe` / `--no-yolo` spellings already cleared the mode; the positive-with-false spellings
were the gap.

Verified against the installed yargs-parser rather than assumed: repeated booleans are last-wins,
not arrays â€” `--unsafe --unsafe=false` and `--unsafe --unsafe false` both give `unsafe: false`, and
`--unsafe=false --unsafe` gives `unsafe: true`. The fix mirrors that in both branches: a false value
clears the mode when it matches the family being parsed, leaving the reverse order still positive.
The family guard matches the existing `--no-*` handling and cannot misfire, because both families
present at once is a conflict and is preserved verbatim before these branches run (P70/P71).

**Why:** This is the same "model what yargs does, not what the flag looks like" correction as P68,
P79 and P87, but on the option where being wrong is most costly: every other misparse writes a wrong
value, this one silently removes the shell restrictions. Clearing to `safe` rather than leaving the
field untouched also keeps the form honest for the mixed case, where the default would otherwise be
indistinguishable from an explicit selection. See [[analysis_87_model_every_attached_boolean]] and
[[analysis_71_preserve_false_safety_flags]].

**Commit:** 5d7e6fe - fix(vscode): round-19 codex review follow-ups for PR #89 (P89-P92)
