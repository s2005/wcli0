# P63 - Prevent implicit home configs from overriding safe mode

When `safetyMode` is `safe` and `wcli0.configFile` is unset, the extension emits no
safety override and no warning, but the server's `loadConfig` still always checks
`~/.win-cli-mcp/config.json` after the private cwd. An existing home config can
therefore disable injection/directory restrictions or replace shell executables while
the extension reports the recommended safe mode; the warning only covers explicitly
referenced files. Non-managed safe launches need an explicit safe config/overrides or at
least the same warning for the implicit home config.

File: `vscode-extension/src/argsBuilder.ts:773`
