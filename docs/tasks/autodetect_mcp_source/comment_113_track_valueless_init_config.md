# P113 - Track valueless init-config before reordering extras

In `vscode-extension/src/configSource.ts` (line 1036) `makeExtrasReorderSafe` consults
`VALUE_OPTIONS` only, but the server also declares `--init-config` as a string option
(`src/index.ts:79-82`), so for a direct entry such as `args: ["--init-config", "--debug", "path"]` -
which yargs reads as an empty `init-config` plus the positional `path`, letting the server run
normally - the token is never marked valueless, the rebuild emits the modeled `--debug` ahead of
the extras as `["--debug", "--init-config", "path"]`, and yargs then makes `path` the option value,
so after an unrelated save the server writes a default config to that path and exits
(`src/index.ts:1590-1598`).
