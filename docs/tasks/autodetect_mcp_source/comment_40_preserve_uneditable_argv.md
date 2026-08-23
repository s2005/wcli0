# P40 - Preserve current uneditable argv settings on file saves

For a file-source stdio save the whole `args` array is regenerated from the
loaded settings snapshot, and the on-disk merge (P20) refreshes only
`extraArgs`-adjacent unmodeled *entry* fields — not the argv-derived settings the
form does not edit (`customArgs`, `blockedCommands`/`blockedArguments`/
`blockedOperators`, `--maxReturnLines`, `--http/sse-allowed-origins`). So if
another editor adds one after the panel loads (e.g. `--blockedCommand rm`), an
unrelated save rebuilds `args` from the stale snapshot and silently removes that
on-disk change. Reparse the current on-disk entry and carry forward every
uneditable argv-derived field, not just `extraArgs` (the args-equivalent of P23,
which already does this for `env`).
Reference: `vscode-extension/src/commands.ts:578` (the file-source stdio
`args` regeneration and on-disk merge).
