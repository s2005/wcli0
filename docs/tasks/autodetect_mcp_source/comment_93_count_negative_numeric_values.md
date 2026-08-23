# P93 - Count negative numeric values as scalar occurrences

In `vscode-extension/src/configSource.ts:557` (the duplicate-scalar pre-scan), yargs consumes a
negative numeric token as the value of the preceding number option, but this guard excludes every
dash-prefixed value: for `--commandTimeout -1 --commandTimeout 5` yargs produces
`commandTimeout: [-1, 5]`, which the server ignores because it is not a scalar number, yet the
reverse parser counts only the second occurrence and a no-op save emits `--commandTimeout 5 -1`,
changing the launch to apply a five-second timeout. Negative numeric tokens must be treated as values
when counting occurrences of number options.
