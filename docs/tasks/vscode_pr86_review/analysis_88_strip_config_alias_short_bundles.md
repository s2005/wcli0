# Analysis 88 - Strip config aliases inside short-option bundles

## Decision: Valid — fix applied

`stripConfigArgs` in `vscode-extension/src/argsBuilder.ts` replaced the start-anchored `-c` bundle
check with one that strips any single-dash bundle containing `c` (the server's only single-char
option): a token where `a[0] === '-'`, `a[1] !== '-'` and `a.includes('c')`. When `c` is the bundle's
final character it carries no attached value, so the next token (if it is a real value, not another
option) is consumed too.

**Why:** yargs recognizes the `c` alias (declared at `src/index.ts:73-76`) anywhere it can parse it in
a short-option bundle, not only at the start. The previous condition missed `-dc /other.json` (c is
the trailing option and reads the next token) and `-xc/other.json` (attached value), so a second
config value reached yargs; `loadConfig` rejects the resulting array and falls back to an implicit
cwd/home config, bypassing the managed or referenced file. The co-bundled letters are not server
options (`c` is the sole short alias), so stripping the whole bundle is safe. A single-dash bundle
without `c` (e.g. `-d`) is preserved. Verified by the `P88` tests in `argsBuilder.test.cjs`.

**Commit:** df1378b — fix(vscode): address Codex round-12 review feedback for PR #86
