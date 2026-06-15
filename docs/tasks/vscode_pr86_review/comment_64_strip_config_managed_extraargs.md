# P64 - Strip config overrides from managed launch extra arguments

When per-shell settings activate managed mode and `wcli0.extraArgs` contains `--config <path>`
or `--config=<path>`, appending it duplicates the managed `--config`; yargs parses the repeated
option as an array, `fs.existsSync` rejects it, and the server falls through to a default/home
config, silently discarding the generated per-shell restrictions. Managed launches must strip a
conflicting `--config` from extraArgs so the managed file always takes effect.

File: `vscode-extension/src/argsBuilder.ts:184` (buildManagedServerArgs / stripConfigArgs)
