# P62 - Don't fabricate config paths from short bundles

In `vscode-extension/src/configSource.ts` (around line 482) a hand-written entry with a
single-dash bundle such as `args: ["-cfoo"]` had everything after `c` treated as the config
path. But the server's yargs `config` alias in `src/index.ts` parses `-cfoo` as an empty
`-c` plus separate short booleans (`-f -o -o`), not as `config: "foo"`. Loading that entry
therefore filled `wcli0.configFile` with a file the server was not using, so a no-op save
could start emitting `--config foo` (or reject the save because `foo` is not loadable) and
change the launched configuration. The parser must only model the bundle remainder as
`configFile` in the shapes yargs actually reads as the config string (a numeric value, or a
value whose first character is a non-word, non-dot path separator), and otherwise preserve
the token verbatim.
