# P1 - Resolve relative paths in generated MCP entries

When `Write .vscode/mcp.json` runs with a relative path setting such as
`allowedDirectories: ["src"]`, `buildLaunchSpec(settings, { resolvePaths: false })`
preserves the bare relative value and emits `--allowedDir src`. The server's
`normalizeWindowsPath` C-roots that to `C:\src` (via `path.win32.resolve('C:\\', 'src')`),
whereas the auto-registration provider and config-file generator anchor relative
paths to the workspace folder. This can deny the intended workspace directory and
allow an unrelated `C:\src`. Source: `vscode-extension/src/commands.ts:82`,
`vscode-extension/src/argsBuilder.ts` `pathValue`.
