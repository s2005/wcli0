# Analysis 11 - Honor empty per-shell executable argument lists

## Decision: Valid - fix applied

`applyPerShellOverrides` used `(perShell.executable?.args?.length ?? 0) > 0`, so an
explicit `executable.args: []` was treated as absent and the shell kept its
default args (e.g. `cmd.exe /c`, `bash -c`). Changed the guard to
`perShell.executable?.args !== undefined`, so an explicit empty array replaces the
default arguments.

**Why:** Empty argument arrays are valid server configuration, needed for
executables that require no prefix arguments; the generated managed config must
launch the requested command, not the default. Pairs with Analysis 12 so such a
config also triggers managed mode.

**Commit:** 07629c2 - fix(vscode): address Codex round-2 review feedback for PR #86
