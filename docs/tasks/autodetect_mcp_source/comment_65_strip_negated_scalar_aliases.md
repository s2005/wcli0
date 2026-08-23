# P65 - Strip negated scalar aliases when replacing preserved flags

In `vscode-extension/src/argsBuilder.ts` (around line 300), `stripValueFlag`
only matches the positive option names. When a loaded file entry has a yargs
negation for a scalar option in `extraArgs` (e.g. `--no-shell`,
`--no-logDirectory`, `--no-commandTimeout`) and the user sets that same field in
the form, the negated token is appended after the generated value. Yargs then
parses arrays such as `shell: ['cmd', false]` or `logDirectory: ['/tmp', false]`,
so the edited value is ignored or even crashes the server. The corresponding
`--no-*` forms must be stripped whenever the positive scalar is emitted.
