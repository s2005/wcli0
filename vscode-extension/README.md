# wcli0 — Windows CLI MCP Server (VS Code extension)

Configure and run the [`wcli0`](https://github.com/s2005/wcli0) Windows CLI MCP
server from VS Code, with all configuration driven by ordinary VS Code
settings. Because VS Code settings split into **User** and **Workspace** scopes,
you get per-user defaults plus per-project overrides for free — no hand-edited
`mcp.json` required.

## What it does

- **Registers the wcli0 MCP server automatically.** Using VS Code's MCP Server
  Definition Provider API (VS Code 1.101+), the extension builds the server
  launch command from your `wcli0.*` settings and exposes it to Copilot / the
  built-in MCP client. Change a setting and the server definition refreshes.
- **Provides a configuration form.** `wcli0: Configure Server…` opens a panel
  where you pick a scope (User or Workspace) and edit the common options
  (launch method, shells, allowed directories, timeouts, safety level,
  logging, transport).
- **Generates artifacts on demand:**
  - `wcli0: Generate config.json From Settings` writes a `wcli0` JSON config
    file (the `--config` format).
  - `wcli0: Write .vscode/mcp.json` writes a workspace `mcp.json` entry for
    clients that read that file directly.
  - `wcli0: Show Resolved Launch Command` prints the exact command line.

## Configuration model

The server is launched as either:

| Launch method | Command |
| ------------- | ------- |
| `npx` (default) | `npx -y <packageSpec> <flags>` |
| `node` | `node <nodeScriptPath> <flags>` |
| `custom` | `<customCommand> <customArgs> <flags>` |

Every `wcli0.*` setting maps to a wcli0 CLI flag. Highlights:

| Setting | Flag |
| ------- | ---- |
| `wcli0.shell` | `--shell` (omitted when `all`) |
| `wcli0.allowedDirectories` | repeated `--allowedDir` |
| `wcli0.commandTimeout` | `--commandTimeout` |
| `wcli0.maxCommandLength` | `--maxCommandLength` |
| `wcli0.blockedCommands` / `blockedArguments` / `blockedOperators` | `--blockedCommand` etc. |
| `wcli0.maxOutputLines` / `maxReturnLines` | `--maxOutputLines` / `--maxReturnLines` |
| `wcli0.enableTruncation` / `enableLogResources` | `--enableTruncation` / `--enableLogResources` (tri-state) |
| `wcli0.logDirectory` | `--logDirectory` |
| `wcli0.allowAllDirs` | `--allowAllDirs` |
| `wcli0.safetyMode` | `safe` → none, `yolo` → `--yolo`, `unsafe` → `--unsafe` |
| `wcli0.debug` | `--debug` |
| `wcli0.transport.*` | `--transport` / `--http-host` / `--http-port` / … |
| `wcli0.configFile` | `--config` |
| `wcli0.extraArgs` | appended verbatim |

Path-like values support `${workspaceFolder}` (and `${workspaceFolder:name}`,
`${userHome}`).

### User vs. workspace

Set machine-wide defaults in **User** settings (e.g. launch method, package
version, global blocked commands). Override per project in **Workspace**
settings (e.g. `allowedDirectories: ["${workspaceFolder}"]`). Workspace values
win, matching VS Code's normal settings precedence. The Configure panel lets you
target either scope explicitly.

## Transport

VS Code's built-in MCP integration uses **stdio** — keep `wcli0.transport.mode`
at `stdio` for the automatic provider. Selecting `http`/`sse` is intended for
external clients and generated config files; in that case the provider points
VS Code at `http://<host>:<port>/mcp` (or `/sse`) and assumes you run the server
yourself.

## Requirements

- VS Code 1.101 or later for automatic MCP registration. On older versions the
  commands (including `Write .vscode/mcp.json`) still work.
- Node.js available on `PATH` (for the default `npx` launch method).

## Development

```bash
cd vscode-extension
npm install
npm run build      # tsc -> dist/
```

Press F5 in VS Code (with this folder open) to launch an Extension Development
Host.
