# Analysis 87 - Model every attached boolean assignment

## Decision: Valid â€” fix applied

P72 modeled attached boolean assignments but only for the literal spellings `=true` / `=false`,
preserving anything else verbatim on the assumption that yargs would not read it as a boolean. The
installed yargs-parser says otherwise: `processValue` coerces a declared boolean's attached string
with `val === 'true'`, so `--debug=0`, `--debug=1`, `--debug=yes` and `--debug=verbose` all mean
FALSE. Preserving those in `extraArgs` produced the exact failure P72 set out to prevent -- the form
showed the default while the server ran with the flag off, and enabling Debug later emitted
`--debug` followed by the preserved `--debug=0`, which yargs resolves last-wins back to false. The
edit was written, reported as saved, and had no effect.

The fix drops the literal-value gate: every attached assignment is now offered to
`applyAttachedBoolean` with `on = (value === 'true')`, mirroring yargs' own coercion exactly. Flags
that are not known booleans (and safety flags under a conflict) still return false and are preserved
verbatim, so nothing else changes. The P72 test's `--debug=verbose` case was updated from
"preserved" to "modeled as false", which is what the server actually does with it.

**Why:** The parser's contract in this feature is to model what yargs would do, not a subset of
spellings that look modelable -- the same correction P68 made for the space form and P79 for the
separator. Copying yargs' one-line rule is both simpler than the gate it replaces and impossible to
drift from, and it removes a whole class of preserved tokens that could silently override later
edits. See [[analysis_72_model_attached_boolean_assignments]] and
[[analysis_68_honor_explicit_false_boolean_flags]].

**Commit:** f563e8a - fix(vscode): round-18 codex review follow-ups for PR #89 (P87-P88)
