# P73 - Keep dash-prefixed file paths attached

In `vscode-extension/src/argsBuilder.ts:368` (`buildServerArgs` via `pathValue`), a file-source
round-trip preserves a relative path value verbatim, but `buildServerArgs` then emits scalar
path options as the space-separated `--logDirectory <value>` / `--initialDir <value>` form. If
the original entry used a valid attached value that starts with a dash, for example
`--logDirectory=--unsafe` (a directory literally named `--unsafe`), a no-op save rewrites it to
`--logDirectory --unsafe`; yargs then parses `--unsafe` as a separate safety flag rather than
the directory name, changing the launch semantics and potentially disabling protections. Scalar
path options must be emitted with the dash-aware `--opt=value` form (like `pushOption` already
does for the blocked-list options) so a dash-prefixed value stays attached to its flag.
