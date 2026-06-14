# P36 - Resolve per-shell executable command variables

When a managed per-shell executable command uses a supported path token such as
`${workspaceFolder}/bin/shell`, `applyPerShellOverrides` copies the token verbatim into the generated
config rather than resolving it (vscode-extension/src/configFile.ts:132), and managed-mode validation
checks only per-shell path overrides and limits. The server does not expand VS Code variables before
passing `executable.command` to `spawn`, so the configured shell fails to start. Resolve
extension-owned variables in the per-shell executable command/args, and reject unresolved ones before
registering the provider.
