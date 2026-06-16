# P66 - Prevent implicit config files from overriding safe settings

When `wcli0.configFile` is unset, the provider emits no `--config`, but the server's `loadConfig`
still searches the process cwd and `~/.win-cli-mcp/config.json`. A normal non-managed provider
launch can therefore silently inherit an existing config that disables restrictions or changes
shell executables; `safetyMode: safe` emits no CLI flag that restores those protections. The
provider's private cwd only avoids the cwd candidate and does not prevent the home config from
overriding the extension settings, so provider launches need an explicit generated config (or
another way to disable implicit config discovery).

File: `vscode-extension/src/argsBuilder.ts:258` / `vscode-extension/src/mcpProvider.ts`
