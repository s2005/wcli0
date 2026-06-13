# Changelog

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
