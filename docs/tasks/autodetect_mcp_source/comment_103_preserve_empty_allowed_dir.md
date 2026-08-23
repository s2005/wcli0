# P103 - Preserve empty allowed-directory entries

In `vscode-extension/src/argsBuilder.ts:442` (the `allowedDirectories` loop in `buildServerArgs`), a
file entry containing `--allowedDir ""` makes yargs supply `allowedDirs` as `['']`, so
`applyCliShellAndAllowedDirs` enables working-directory restriction with an effectively empty
allowlist; the reverse parser retains that empty element, but `pathValue` returns `undefined` and the
loop omits it, so a no-op save removes the CLI restriction and restores the config/default allowed
paths, potentially enabling commands in directories the authored entry denied. The empty array value
must be preserved verbatim rather than filtered out here.
