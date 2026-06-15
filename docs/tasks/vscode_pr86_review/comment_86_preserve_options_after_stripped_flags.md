# P86 - Preserve options following stripped raw flags

In `vscode-extension/src/argsBuilder.ts:200` (and the matching `--transport` case in
`stripTransportArgs`), when a standalone conflicting flag has no value and is followed by another
option, the unconditional `i++` discards that unrelated option too. For example, managed mode turns
`extraArgs: ['--config', '--debug']` into neither flag, even though yargs parses `--config` as an
empty string and still applies `--debug`; the same happens with `['--transport', '--unsafe']`. Only
consume the following token when it is actually a separate value rather than another option.
