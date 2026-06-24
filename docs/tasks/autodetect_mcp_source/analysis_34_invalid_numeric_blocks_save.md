# Analysis 34 - An invalid numeric flag value is consumed into a typed field and blocks every save

## Decision: Valid — fix applied

`parseServerArgs` parses a number option with
`const n = Number(value); out[key] = Number.isFinite(n) ? n : value`. A
non-numeric value (`--commandTimeout abc`) stores the raw string `'abc'` in the
`number | null` field and consumes the flag (it never reaches `extraArgs`).
`Object.assign` puts that string into `s.commandTimeout`. On save,
`validateLaunchSpec` computes `!(value > 0)` → `!('abc' > 0)` → `!(NaN > 0)` →
blocking, so the save is refused with "wcli0.commandTimeout (abc) must be a
positive number". Because the flag was consumed rather than passed through, the
user cannot save any unrelated edit until they manually clear the field (clearing
works only because an empty number maps back to null and the flag is then simply
absent). A value the parser cannot model should round-trip verbatim through
`extraArgs`, the same escape hatch used for unknown flags.

**Why:** Loading an entry should never leave the user unable to save an
unrelated change. The forward path tolerates only valid numbers, so the reverse
path must not poison a typed field with an unparseable value that the forward
path then rejects.

**Proposed fix:** When `Number(value)` is not finite, push the original
`--flag value` (or `--flag=value`) tokens to `extraArgs` instead of storing the
raw string in the typed field, so they survive a round trip untouched.
Related: [[analysis_33_nonstring_args_coerced_empty]].

**Commit:** ceefe56 — fix(vscode): round-6 codex review follow-ups for PR #89 (parser + save round-trip)
