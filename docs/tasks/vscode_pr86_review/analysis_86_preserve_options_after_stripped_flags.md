# Analysis 86 - Preserve options following stripped raw flags

## Decision: Valid — fix applied

Both `stripTransportArgs` and `stripConfigArgs` in `vscode-extension/src/argsBuilder.ts` no longer
unconditionally `i++` after matching a value-less conflicting flag (`--transport`, `--config`, `-c`,
`--c`). They now consume the following token only when it exists and does not start with `-` (i.e. it
is a real value, not another option). The matching short-bundle branch applies the same rule when
`c` is the trailing option of a bundle.

**Why:** yargs parses `--config --debug` as `config=""` plus a still-applied `--debug` (and likewise
`--transport --unsafe`). The previous code skipped the next token unconditionally, so managed mode
turned `extraArgs: ['--config', '--debug']` into neither flag, silently dropping the unrelated
`--debug`. Only consuming an actual value preserves following options while still stripping the
conflicting flag. Verified by the `P86` tests in `argsBuilder.test.cjs` (a value-less `--config`/
`--transport` followed by another option keeps that option).

**Commit:** a31e500 — fix(vscode): address Codex round-12 review feedback for PR #86
