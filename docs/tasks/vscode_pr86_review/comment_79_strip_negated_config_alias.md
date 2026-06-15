# P79 - Strip the negated config alias from extraArgs

`stripConfigArgs` (`vscode-extension/src/argsBuilder.ts`) handles `--no-config` but not `--no-c`.
yargs aliases `c` to `config`, so a managed/referenced launch carrying `extraArgs: ["--no-c"]`
parses the mandatory `--config <path>` plus `--no-c` into a mixed array; `loadConfig` then catches
the `fs.existsSync` error and falls back to an implicit cwd/home config, bypassing the generated
per-shell and safety settings. Strip `--no-c` alongside `--no-config`.
