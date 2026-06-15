# Analysis 71 - Strip every yargs config-alias form

## Decision: Valid — fix applied

`stripConfigArgs` (argsBuilder.ts) only removed `--config`/`-c`/`--config=`/`-c=`, leaving the other
forms yargs accepts for the `config` option (alias `c`): the long single-char alias `--c X` / `--c=X`,
short-option bundling `-cX` (e.g. `-c/other.json`), and the boolean negation `--no-config`. Any of
these surviving in `extraArgs` re-introduces the original bug: yargs parses a repeated/false `config`,
`loadConfig` rejects the array/false and falls back to `<cwd>/config.json` or
`~/.win-cli-mcp/config.json`, bypassing the mandatory managed/referenced config. The strip now removes
all of these forms while preserving an unrelated `--config*` long flag (e.g. `--config-check`) and a
user `--config` when the extension emits none (the plain-launch escape hatch).

**Why:** The server registers `c` as the yargs alias for `config` (src/index.ts), and yargs exposes a
string option under every alias spelling plus `=`-attached, bundled, and `--no-` negated forms. Mirror
exactly that surface so no spelling slips through. The short-bundling branch is gated on a single-dash
`-c` token (the only single-char option) with an attached value, so `--`-prefixed long flags are never
touched. Verified by added `P71` tests in `argsBuilder.test.cjs` (managed launch strips `--c`,
`--c=`, `-c/...`, `--no-config`; a referenced launch strips the alias forms yet keeps `--config-check`).

**Commit:** 12f75fa — fix(vscode): address Codex round-10 review feedback for PR #86
