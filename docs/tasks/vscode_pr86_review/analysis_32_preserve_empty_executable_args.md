# Analysis 32 - Preserve empty positional executable arguments in the form

## Decision: Valid — fix applied

`collectShells` parsed the executable-args textarea with the same `arr`/`linesOf` helper used for
path and restriction lists, which trims and drops empty lines. An args list such as `['--flag', '']`
was reduced to `['--flag']` on every save, even when the shell's args were untouched. Added a dedicated
`argLines` helper that preserves empty entries (only a wholly blank textarea is treated as "no list",
distinguishing an explicit `[]` from "unset" via the loaded value), and used it for the args textarea
only.

**Why:** The server passes `executable.args` verbatim to `spawn`, so empty positional arguments are
significant and must round-trip losslessly; path/restriction lists keep their empty-filtering because
an empty prefix there would dangerously match every path.
