# P45 - Parse bundled config aliases as configFile

The server registers `config` with alias `c`, and `argsBuilder.stripConfigArgs`
documents that yargs accepts bundled forms such as `-c/other.json` and
`-xc /other.json`, but the reverse `VALUE_OPTIONS` table only recognizes `-c` as a
separate token (plus `=` forms handled later). A loaded entry using a bundled alias
keeps the real config pin hidden in `extraArgs`, so the Config file field and
loadability checks think there is no `--config` while the server will still load
one; handle the bundled `c` forms in `parseServerArgs` the same way the forward
stripper does.
Reference: `vscode-extension/src/configSource.ts:124-147` (`VALUE_OPTIONS`) and
`argsBuilder.ts:250-263` (`stripConfigArgs` bundle handling).
