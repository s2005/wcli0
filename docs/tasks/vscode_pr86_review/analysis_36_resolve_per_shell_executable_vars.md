# Analysis 36 - Resolve per-shell executable command variables

## Decision: Valid — fix applied

`applyPerShellOverrides` copied a per-shell `executable.command`/`args` verbatim, so a token such as
`${workspaceFolder}/bin/shell` reached the generated config unresolved; the server passes
`executable.command` to `spawn` without expanding VS Code variables, so the shell failed to start, and
managed-mode validation never checked it. Now the per-shell executable command and args are run
through `resolveVariables` when emitted, and `validateLaunchSpec`'s managed branch rejects a per-shell
executable command/arg that still contains an unresolved `${workspaceFolder}`/`${userHome}` token.

**Why:** Extension-owned path tokens must be resolved before they reach the server (which performs no
expansion), mirroring how the global launch path and other per-shell paths are handled; bare PATH
executables (`bash`, `cmd.exe`) carry no tokens and pass through unchanged, and arbitrary `${FOO}`
shell templates are intentionally not flagged.

**Commit:** 174b9ce — fix(vscode): address Codex round-4 review feedback for PR #86
