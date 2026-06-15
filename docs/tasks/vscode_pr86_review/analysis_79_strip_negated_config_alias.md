# Analysis 79 - Strip the negated config alias from extraArgs

## Decision: Valid — fix applied

`stripConfigArgs` now drops `--no-c` in addition to `--no-config`.

**Why:** yargs aliases `c` to `config`, so `--no-c` sets `config=false` exactly like `--no-config`.
With the mandatory managed/referenced `--config <path>` also present, yargs parses `config` as a mixed
array, `loadConfig` rejects it, and the server falls back to an implicit cwd/home config — bypassing
the generated per-shell and safety settings. This completes the round-10 P71 alias-stripping work
(the negated alias spelling was the one remaining form). Verified by an added `P79` test in
`argsBuilder.test.cjs` (a managed launch strips both `--no-c` and `--no-config`).

**Commit:** fce0c44 — fix(vscode): address Codex round-11 review feedback for PR #86
