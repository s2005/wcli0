# P80 - Reject unresolved variables in per-shell executable commands

The per-shell executable-command validation in `validateLaunchSpec`
(`vscode-extension/src/argsBuilder.ts`) only flags `${workspaceFolder}`/`${userHome}`, so an enabled
shell command containing an arbitrary token such as `${SHELL_BIN}` passes. The generated config keeps
the literal token and the server passes `executable.command` directly to `spawn` without shell
expansion, so that shell fails every time. Unlike executable arguments, the command itself cannot
safely contain arbitrary shell templates and must be rejected.
