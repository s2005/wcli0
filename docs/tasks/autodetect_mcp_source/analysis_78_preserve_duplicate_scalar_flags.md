# Analysis 78 - Preserve duplicate scalar flags instead of last-wins

## Decision: Valid — fix applied

`applyValue` wrote each scalar option (`string`/`number`/`csv` kinds) straight onto the settings
object, so a repeated scalar collapsed last-wins: `--config a --config b` loaded as `config=b`,
`--shell cmd --shell bash` as `shell=bash`. yargs instead parses a repeated scalar as an array
(`['a','b']`), which the single-value form field cannot represent and which the server treats very
differently (config-array loading, etc.). A no-op save then silently rewrote the hand-authored entry
to the last value, changing the launch.

The fix adds a pre-scan (`duplicatedScalarKeys`) that counts scalar value-option occurrences per
settings key. The count mirrors the modeling paths exactly — it honors the stdio transport exclusion
(`optionFor`), the number-diversion rule (`divertNumber`), the `-c` config bundle, and stops at the
`--` separator (P74) — so a key is flagged only when two occurrences would really have landed in the
same field. At each scalar modeling site (attached `--opt=value`, space `--opt value`, and both `-c`
bundle forms) a flagged key is now preserved verbatim in `extraArgs` instead of modeled. Array-kind
options (allowedDirectories, blockedCommands, ...) legitimately repeat and are untouched; a single
scalar occurrence is still modeled normally, so the common case does not regress.

**Why:** "Preserve/refuse rather than collapse" is the only lossless choice — the typed field cannot
hold an array, so modeling it would always misrepresent the entry and a save would change behavior.
Counting through the same predicates the loop uses keeps the pre-scan and the parse in agreement, and
exempting array kinds preserves the existing accumulation semantics (P47). The duplicate's
occurrences round-trip in original order, so re-emitting them reproduces the server's array exactly.

**Commit:** bb6fe6c — fix(vscode): round-15 codex review follow-ups for PR #89 (P74-P78)
