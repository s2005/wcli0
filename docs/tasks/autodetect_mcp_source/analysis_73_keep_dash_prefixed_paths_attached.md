# Analysis 73 - Keep dash-prefixed file paths attached

## Decision: Valid — fix applied

`buildServerArgs` emitted its scalar path options — `--config`, `--allowedDir`,
`--initialDir`, `--logDirectory`, `--wslMountPoint` — as two separate argv entries
(`args.push(flag, value)`). A file-source round-trip (`preserveRelativePaths`)
preserves a value verbatim, so a directory literally named `--unsafe` (authored as
the attached `--logDirectory=--unsafe`, which the parser models into the typed
field) was re-emitted as `--logDirectory --unsafe`. yargs then parses `--unsafe` as
a separate safety flag rather than the directory name, changing the launch
semantics and potentially disabling protections on a no-op save.

The fix routes those scalar emissions through the existing `pushOption` helper,
which already emits the dash-aware `--opt=value` form (it was used for the
blocked-list options for exactly this reason). A dash-prefixed value now stays
attached to its flag (`--logDirectory=--unsafe`), so yargs reads it as the value;
the round-trip parser handles the attached form on reload. Non-dash values are
unaffected — `pushOption` still emits them as separate tokens, so existing output
is byte-for-byte identical.

**Why:** The forward builder must produce argv that yargs parses back to the same
values the form holds; a dash-prefixed scalar broke that invariant for the same
reason the blocked-list options already used `pushOption`. Applying the same helper
to every value-bearing scalar whose value can start with a dash closes the gap
consistently rather than special-casing one option. `pushOption`'s doc comment was
generalized to note the path-flag use, and a P73 test asserts the attached form for
all five scalar path options plus the unchanged space-separated emission for a
normal value.

**Commit:** ce1a2b3 — fix(vscode): round-14 codex review follow-ups for PR #89 (P71-P73)
