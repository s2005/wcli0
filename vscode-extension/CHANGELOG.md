# Changelog

## Unreleased

- Expanded the unit suite to cover the MCP provider, commands, settings, the
  configuration webview, and activation; ~100% line / ~96% branch / ~98%
  function coverage. Added `npm run test:coverage` with enforced thresholds.
- Disabled `esModuleInterop` (the code uses only namespace/named imports), so
  compiled output requires `vscode` directly without interop helpers.

## 0.1.0

Initial release.

- Automatic registration of the wcli0 MCP server via VS Code's MCP Server
  Definition Provider API, driven entirely by `wcli0.*` settings.
- User- and workspace-scoped settings covering launch method, shells, allowed
  directories, limits, safety mode, logging, and transport.
- `wcli0: Configure Server…` webview form with explicit scope selection.
- Commands to generate a `config.json`, write `.vscode/mcp.json`, show the
  resolved launch command, and restart the server.
- `${workspaceFolder}` / `${userHome}` variable resolution in path settings.
