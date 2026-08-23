# Analysis 100 - Preserve unsupported shell names

## Decision: Valid — fix applied

P96 diverted the exact value `all` because the form's shell control uses it as an omission
sentinel. The review is right that the same reasoning covers every value the control cannot hold:
the shell field is a fixed `<select>` offering Inherit, `all`, and the five real shell names
(`SHELL_NAMES`). Assigning `fish` to it leaves the select on its empty value, the form immediately
counts as dirty, and a save drops `--shell` entirely — so an entry the server matched to NO shell
(nothing is named `fish`) becomes one running every default shell. Exactly the P96 escalation, one
step wider.

`divertShellAll` is now `divertShellValue`: a `--shell` value is modeled only when it is one of the
five names the select offers, and anything else (`all`, `fish`, `zsh`, `ALL`) is preserved verbatim
in `extraArgs` for both the space and attached spellings. The five real names stay fully editable,
and choosing one in the form still strips the preserved copy (P61) so the edit wins.

**Why:** The rule "model only what the control can represent" is what P96 established; keying it to
`SHELL_NAMES` — the list the select is built from — makes it structural instead of a special case,
so a new shell name added to the enum stays modelable automatically and everything else is preserved
without further review rounds. See [[analysis_96_preserve_explicit_shell_all]] and
[[analysis_61_strip_preserved_value_flags]].

**Commit:** f03b33f - fix(vscode): round-23 codex review follow-ups for PR #89 (P100-P102)
