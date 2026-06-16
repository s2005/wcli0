# P2 - Refresh the provider when workspace folders change

When a multi-root workspace removes or reorders its first folder,
`primaryWorkspaceFolder()` and every `${workspaceFolder}` resolution can change
without any `wcli0` setting changing, but `onDidChangeConfiguration` is the only
automatic call to `provider.refresh()`. The cached definition keeps launching
with paths and resource-scoped settings from the old primary folder until the
user manually refreshes or reloads the window. Also refresh on
`workspace.onDidChangeWorkspaceFolders`. Source:
`vscode-extension/src/extension.ts:55`.
