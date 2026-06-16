# P6 - Preserve per-shell settings in mcp.json exports

When `wcli0.shells` contains per-shell executable, path, or security overrides,
the auto-registration provider switches to a managed config (those settings
cannot be CLI flags), but `writeWorkspaceMcpJson` still calls `buildLaunchSpec`
without a managed config. The committed `.vscode/mcp.json` then silently ignores
every per-shell setting and can launch with different enabled shells or weaker
global restrictions than configured. The command should refuse the export (or
emit an accompanying portable config) instead of writing the mismatched entry.
Source: `vscode-extension/src/commands.ts:82`.
