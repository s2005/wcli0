# P74 - Stop parsing args after the `--` separator

In `vscode-extension/src/configSource.ts:520` (`parseServerArgs`), the main loop keeps modeling
tokens after the `--` options separator as wcli0 flags. yargs-parser treats every token after `--`
as a positional, not an option, so a plain `node dist/index.js -- --shell cmd` entry is launched
with `--shell`/`cmd` as positionals, but the reverse parser loads it as `shell=cmd`; a no-op save
then re-emits an active `--shell cmd`, changing the launch behavior. The parser must preserve `--`
and the remainder verbatim and stop option parsing.
