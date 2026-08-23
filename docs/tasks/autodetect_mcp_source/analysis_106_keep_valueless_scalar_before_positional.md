# Analysis 106 - Keep valueless scalar flags ahead of following positionals

## Decision: Valid — fix applied

The parser preserved a valueless value option verbatim, which is correct in isolation but not once
the builder reorders: `buildServerArgs` appends `extraArgs` AFTER the flags generated from the typed
fields, so two tokens the entry deliberately kept apart become neighbours. yargs reads
`node dist/index.js --shell --debug cmd` as shell='', debug=true and a POSITIONAL `cmd`; the rebuilt
`--debug --shell cmd` makes `cmd` the shell value, so a no-op save changed which shell the server
enables.

The parser now records which preserved options were valueless (`valuelessOptionAt`) — a fact only the
parse knows, since once the tokens sit side by side in `extraArgs` it is no longer visible — and
`makeExtrasReorderSafe` rewrites them, but ONLY when a real positional follows. Each kind is
re-emitted in the form that cannot capture a following token, verified against the installed parser:
a string/csv option becomes `--flag=` (identical parse, consumes nothing); a number option is dropped
because a valueless one defines no key at all while `--flag=` would define 0; an array option is
dropped because a valueless one yields `[]` (ignored by the server) while `--flag=` would yield `['']`
— the deny-all of P103. A valueless `c` bundle becomes `-<other letters> --config=`, since `-c=`
swallows the next token.

**Why:** Gating on "is there actually a positional after it" is what keeps this from churning every
other preserved shape — a valueless flag next to another flag (P44) or next to its own repeated
occurrence (P78/P98) is already safe in any order and still round-trips byte-for-byte. The rewrite
targets exactly the arrangement the builder can corrupt. See
[[analysis_109_preserve_valueless_array_before_positional]] and [[analysis_44_dont_consume_flag_as_value]].

**Commit:** cd74db6 - fix(vscode): address the five P2 findings missed by the #89 merge (P106-P110)
