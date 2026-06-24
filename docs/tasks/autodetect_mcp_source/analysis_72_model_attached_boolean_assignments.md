# Analysis 72 - Model attached boolean assignments before saving

## Decision: Valid — fix applied

`parseServerArgs`' attached-form branch (`--opt=value`) only consulted
`VALUE_OPTIONS`, which lists value-bearing flags. The server's boolean options
(`debug`, `enableTruncation`, `enableLogResources`, `allowAllDirs`, `yolo`,
`unsafe`) are not value-bearing, so a yargs attached assignment such as
`--debug=true` or `--enableTruncation=false` fell through to `extraArgs` verbatim
instead of being modeled. The form then showed the option's default value, and
because the preserved token sits later in argv, a user who changed that setting in
the form got `--debug` (or `--no-enableTruncation`) emitted *before* the stale
`--debug=false` — yargs last-wins let the preserved attached value defeat the edit,
so the setting could not be changed from the form.

The fix adds an `applyAttachedBoolean` helper invoked from the attached-form branch
for the literal `=true`/`=false` yargs round-trips: it models each boolean (and its
kebab-case alias) the same way the bare spellings already are, so the value leaves
`extraArgs` and the form reflects it. Safety flags are modeled only when there is no
conflict (`--unsafe=true` -> unsafe, `--yolo=false` -> default safe); under a
conflict they return false and round-trip verbatim, preserving the server-rejected
state (P71). Any non-`true`/`false` attached value on a boolean flag (e.g.
`--debug=verbose`) is still preserved verbatim, since the typed field cannot
faithfully hold it.

**Why:** Modeling the value is the only way the form can edit it; leaving it in
`extraArgs` both hid the real setting and silently overrode the user's edit on save.
The change mirrors the existing P68 handling of the bare `--debug false` form, so
the attached and space-separated spellings now behave identically. Restricting
modeling to the exact `true`/`false` tokens keeps the parser faithful to yargs and
avoids coercing ambiguous values into the typed field (matching the P34/P59
"divert what cannot be faithfully modeled" philosophy).

**Commit:** ce1a2b3 — fix(vscode): round-14 codex review follow-ups for PR #89 (P71-P73)
