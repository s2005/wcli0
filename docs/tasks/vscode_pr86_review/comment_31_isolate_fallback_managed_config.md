# P31 - Isolate fallback managed configs between workspace windows

When the workspace-scoped `managedConfigDir` cannot be created but the global `safeCwd`
(globalStorage) remains available, `writeManagedConfig` falls back to that shared global directory in
every VS Code window and writes the fixed `managed-config.json` filename
(vscode-extension/src/mcpProvider.ts:97). Two windows with different per-shell or safety settings can
overwrite each other's managed config, and a concurrent or cached-definition restart may launch one
workspace using the other's configuration. Use a workspace- or window-unique fallback path instead of
the shared global target.
