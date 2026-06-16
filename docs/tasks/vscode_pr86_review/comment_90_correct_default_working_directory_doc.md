# P90 - Correct the documented default working directory

In `vscode-extension/package.json:137`, the `wcli0.launch.cwd` description says it defaults to the
first workspace folder. When the setting is unset the provider deliberately launches from
extension-owned storage or a unique temporary directory (`mcpProvider.ts:277-293`), not the workspace
folder, so the server does not auto-load an implicit workspace `config.json`. The description misleads
users who expect workspace-relative process behavior; document the private-directory default.
