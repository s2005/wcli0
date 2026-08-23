# Analysis 47 - Recognize yargs kebab-case option aliases

## Decision: Valid — fix applied

The server defines its multi-word options in camelCase, but yargs camel-case
expansion also accepts the kebab-case spelling, so a hand-written entry may write
`--max-command-length 1000` (applied by the server as `maxCommandLength`). The
reverse `VALUE_OPTIONS`/`BOOLEAN_FLAGS` tables only recognized the camelCase forms,
so a kebab-case value was hidden in `extraArgs`; if the user then set the same field
in the form, the save emitted both spellings and yargs parsed the scalar as an array,
making the server ignore the override. The fix adds kebab-case aliases for every
modeled camelCase value option and boolean/tri-state flag, mapped identically to
their camelCase forms.

**Why:** The reverse parser must recognize the same flag spellings yargs accepts in
the forward direction, or a perfectly valid committed entry round-trips into a
duplicated, server-breaking arg list. Modeling the kebab aliases (not just preserving
them verbatim) lets the form edit the value and re-emit a single canonical spelling.

**Proposed fix:** Add `--allowed-dir`, `--initial-dir`, `--command-timeout`,
`--max-command-length`, `--wsl-mount-point`, `--blocked-command`,
`--blocked-argument`, `--blocked-operator`, `--max-output-lines`,
`--max-return-lines`, `--log-directory` to `VALUE_OPTIONS`; add `--allow-all-dirs`,
`--enable-truncation`/`--no-enable-truncation`,
`--enable-log-resources`/`--no-enable-log-resources` to `BOOLEAN_FLAGS` and the
boolean handling in `parseServerArgs`.

**Commit:** 3c4a087 — fix(vscode): round-7 codex review follow-ups for PR #89 (parser + save round-trip)
