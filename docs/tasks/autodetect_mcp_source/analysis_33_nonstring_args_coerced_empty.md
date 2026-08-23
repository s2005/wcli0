# Analysis 33 - Non-string `args` elements are silently coerced to empty string

## Decision: Valid — fix applied

`parseMcpEntry` builds the arg list with
`entry.args.map((a) => asString(a))`, and `asString` returns `''` for every
non-string. A numeric arg (`args: ["--inspect", 9229]`) therefore becomes
`["--inspect", ""]`; the next save writes `"--inspect", ""`, corrupting the
original value. The inconsistency is with `env`: P9 made the file-source save
round-trip the raw on-disk `env` verbatim (numbers, null, etc.) precisely so an
unrelated save would not mangle it, but `args` are always rebuilt from the
coerced settings. Node's `spawn` would have stringified `9229` to `"9229"`, so
`asString`'s `''` is more lossy than the server's own coercion.

**Why:** An unrelated save must not modify values the form does not edit. Args
are form-modeled (custom args / extra args / server flags), so they cannot be
preserved verbatim the way `env` is, but coercing non-strings to `''` is a
silent corruption a reviewer would flag alongside P9.

**Proposed fix:** Coerce with `String(a)` (matching node's spawn behavior) at
minimum, or — for full fidelity — round-trip the raw `entry.args` verbatim from
the on-disk entry on a file-source save the way `env` is, regenerating only the
modeled flags. Related: [[analysis_34_invalid_numeric_blocks_save]].

**Commit:** ceefe56 — fix(vscode): round-6 codex review follow-ups for PR #89 (parser + save round-trip)
