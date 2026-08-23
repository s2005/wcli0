# Analysis 114 - Preserve boolean-like positionals before boolean flags

## Decision: Valid - fix applied

`buildServerArgs` appends `extraArgs` after the flags it generates, so a leading `true`/`false`
positional preserved in `extraArgs` landed directly behind a generated bare boolean flag, and yargs
consumes exactly a literal `true`/`false` after a declared boolean as its VALUE. Verified against
the installed yargs: `--enableTruncation false` yields `enableTruncation: false` and NO positional,
while `--enableTruncation=true false` yields `true` plus the positional - so the entry
`["false", "--enableTruncation=true"]` came back as `["--enableTruncation", "false"]` and an
unrelated save both disabled truncation and deleted the positional. `argsBuilder.ts` now rewrites
that one token into its attached `--flag=true` form when the first preserved extra is `true` or
`false`, in `buildServerArgs` (covering the plain append AND the P112 array hoist, where the last
NON-array flag is what ends up in front of the run) and in `buildManagedServerArgs`, whose
`--debug` had the same exposure.

**Why:** The attached form was preferred over hoisting the positional in front of the flag: it is a
single-token, provably equivalent change - the builder emits a bare boolean spelling only for an
ENABLED setting, a disabled one being `--no-*`, which consumes nothing - and it mirrors the
self-terminating `--flag=` rewrite P106 already uses on the parse side. Hoisting would have had to
interleave with the P112 array hoist and could strand the positional behind a different flag. The
guard is deliberately narrow: only the generated token that will sit immediately before the
preserved run is examined, and only when that run starts with a literal `true`/`false`, because
every other value the builder emits is preceded by its own flag and any other positional is already
safe. `--allowAllDirs`, `--yolo`, `--unsafe`, `--debug`, `--enableTruncation` and
`--enableLogResources` are the full set of bare boolean flags the builder emits.

**Commit:** af0d21e - fix(vscode): address review feedback for PR #93 (P113-P115)
