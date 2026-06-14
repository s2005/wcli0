# P29 - Export the scope shown by the configuration form

The config form displays only the selected scope's stored values via `readSettingsForScope`
(User scope inside a workspace shows user-only values), but the export commands
(`generateConfigFile`, `writeWorkspaceMcpJson`, `showLaunchCommand`) re-read the merged
workspace-effective settings (vscode-extension/src/webview.ts:121). An export can therefore contain
hidden workspace overrides — for example `safetyMode: unsafe` — despite the form claiming the output
matches what is visible. Pass the selected scope to the export commands so they read the same scope
the form shows.
