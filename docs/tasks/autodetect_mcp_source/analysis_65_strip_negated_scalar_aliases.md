# Analysis 65 - Strip negated scalar aliases when replacing preserved flags

## Decision: Valid — fix applied

`stripValueFlag` removed a preserved scalar flag from `extraArgs` only by its
positive spellings (`--flag`, `--flag=value`). A loaded file's yargs negation of
the same option (`--no-shell`, `--no-logDirectory`, `--no-commandTimeout`, ...)
is not modeled by the parser, so it stayed in `extraArgs`; once the user set that
field in the form, `buildServerArgs` emitted the positive flag and then appended
the surviving negation. Yargs parsed the option as an array
(`shell: ['cmd', false]`, `logDirectory: ['/tmp', false]`) the server's scalar
`applyCli*` helpers resolve to neither, so the edited value was ignored or
crashed the server. The fix builds a negated-name set (`--flag` -> `--no-flag`)
inside `stripValueFlag` and drops any matching `--no-*` token (carrying no value,
so the token alone is removed).

**Why:** The strip is already gated by the same emission condition as each
positive flag, so an UNSET field still round-trips its preserved negation
verbatim — only when the form actually emits the positive value is the
conflicting negation removed, exactly as required to avoid the array-coercion
hazard. Boolean-array options (`--allowedDir`, `--blocked*`) are not routed
through `stripValueFlag`, so this scalar-only change cannot disturb the
intentional repeat-merge behavior. Handled at the emitter (not the parser) per
the review's guidance, keeping an untouched scalar negation preserved on save.

**Commit:** 18dc478 — fix(vscode): round-12 codex review follow-ups for PR #89 (P63-P66)
