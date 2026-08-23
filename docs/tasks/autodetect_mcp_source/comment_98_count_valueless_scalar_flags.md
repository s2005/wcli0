# P98 - Count valueless scalar flags as duplicate occurrences

In `vscode-extension/src/configSource.ts:578` (the duplicate-scalar pre-scan), a scalar occurrence is
ignored when its next token is another option: for `--shell --debug --shell bash` the installed yargs
parser used by `src/index.ts` produces `shell: ['', 'bash']`, so the server enables no shell, but this
parser models only `bash`, preserves the first `--shell`, and the builder later strips that preserved
token when emitting the modeled value -- a no-op save consequently rewrites the entry to a single
`--shell bash`, enabling command execution through Bash. The valueless string occurrence must be
counted so the entire duplicate sequence is preserved.
