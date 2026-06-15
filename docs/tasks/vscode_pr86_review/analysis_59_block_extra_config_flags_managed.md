# Analysis 59 - Block extra config flags in managed mode

## Decision: Valid — fix applied

A new `stripConfigArgs` helper removes any `--config`/`-c` entry (separate value or
`--config=`/`-c=` form) from `extraArgs`. It is applied whenever the extension emits
its own `--config`: the managed-config launch (always) and the non-managed
referenced-config path (when `wcli0.configFile` is set). When the extension emits no
`--config` (no managed mode, no configFile) a user's `--config` in extraArgs is left
untouched as a legitimate escape hatch.

**Why:** the server's `config` option is a scalar string with alias `c`
(`src/index.ts`), so a repeated `--config` makes yargs parse `args.config` as an array.
`loadConfig` passes that array to `fs.existsSync`, which rejects it and falls back to
`<cwd>/config.json` or `~/.win-cli-mcp/config.json` — silently bypassing the mandatory
managed config (and every generated per-shell/safety setting) or the referenced config
file. Dropping the conflicting `--config` keeps the intended config in effect. Mirrors
the existing `stripTransportArgs` (P57) approach. Verified by `P59` tests in
`argsBuilder.test.cjs` (managed and referenced-config stripping, and passthrough when no
config is emitted).

**Commit:** d85a780 — fix(vscode): address Codex round-8 review feedback for PR #86
