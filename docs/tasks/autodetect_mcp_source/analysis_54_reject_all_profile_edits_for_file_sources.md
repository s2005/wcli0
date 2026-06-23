# Analysis 54 - Reject all profile edits for file sources

## Decision: Valid — fix applied

The file-source guard gated profiles on `hasRawProfilesConfig`, which only counts
launch-MEANINGFUL profiles (those `buildProfiles` would emit). The Profiles editor,
however, accepts any JSON object, so a non-emittable profile such as
`{"p":{"description":"x","env":{}}}` slipped past the guard. The save "succeeded", the
entry stored nothing (no entry can carry profiles), and the post-write reparse returned
an empty profiles map while the UI reported Saved — silently discarding the edit.

The fix gates the file-source guard on ANY non-empty `settings.profiles` object
(`Object.keys(...).length > 0`) instead of `hasRawProfilesConfig`. Emptiness is the
correct gate because a clean file load never populates profiles (`parseMcpEntry` leaves
them `{}`), so the refusal fires only on a real edit, never on an untouched save.

**Why:** The question for a file source is not "would this profile force a managed
launch?" but "can this entry store it?" — and the answer is never. So any non-empty
profiles object is an unsaved edit and must be refused, matching the intent of the
existing P29/P-maskedshells guards. (Per-shell config keeps using
`hasRawPerShellConfig` because `collectShells` already submits only meaningful shells,
so no analogous non-meaningful gap exists there.)

**Proposed fix:** Replace `hasRawProfilesConfig(settings)` in the guard with a
non-empty `settings.profiles` check.

**Commit:** 8be428b — fix(vscode): round-8 codex review follow-ups for PR #89 (file-source save round-trip)
