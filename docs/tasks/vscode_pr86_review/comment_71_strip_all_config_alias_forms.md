# P71 - Strip every yargs config-alias form

`stripConfigArgs` in `vscode-extension/src/argsBuilder.ts` (line 190) only removes the
`--config`/`-c`/`--config=`/`-c=` forms, so an `extraArgs` entry using another valid alias form
(`--c /other.json`, `-c/other.json`, or `--no-config`) survives. yargs registers `c` as the alias
for `config`, so the surviving flag makes the server parse a repeated/false `config` and fall back
to the cwd/home config, bypassing the mandatory managed/referenced config.
