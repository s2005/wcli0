# P59 - Block extra config flags in managed mode

When per-shell managed mode is active and `wcli0.extraArgs` contains `--config` or
`-c`, appending it after the managed `--config` makes yargs parse `args.config` as an
array. `src/index.ts` passes that array to `loadConfig`, whose `fs.existsSync` call
rejects it and falls back to another/default config, so the provider launches while
silently ignoring every generated per-shell and safety setting. Reject config flags
from `extraArgs` in managed mode rather than allowing them to invalidate the mandatory
managed config.

File: `vscode-extension/src/argsBuilder.ts:154`
