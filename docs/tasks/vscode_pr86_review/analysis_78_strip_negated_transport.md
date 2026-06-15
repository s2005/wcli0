# Analysis 78 - Strip the negated transport option from extraArgs

## Decision: Valid — fix applied

`stripTransportArgs` now drops `--no-transport` (no value token) on every forced-stdio launch,
alongside the existing `--transport`/`--transport=` handling.

**Why:** yargs parses `--no-transport` as `transport=false`, which fails the server's string-choice
validation (`src/index.ts`) and exits the process before it can speak stdio. Dropping the flag mirrors
the `--no-config` handling in `stripConfigArgs`. Verified by an added `P78` test in
`argsBuilder.test.cjs` (a forced-stdio launch strips `--no-transport` while keeping unrelated extras).
