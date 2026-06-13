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

- VS Code 1.101 or later (required for the MCP server definition provider API).
- Node.js available on `PATH` (for the default `npx` launch method).

## Development

```bash
cd vscode-extension
npm install
npm run build      # tsc -> dist/
```

Press F5 in VS Code (with this folder open) to launch an Extension Development
Host.

## Testing

Two layers:

- **Unit tests** (`npm run test:unit`) cover the extension logic — CLI-flag
  building, launch-spec assembly, `config.json` generation, settings
  normalization, the MCP definition provider, the commands, the configuration
  webview, and activation. They run under plain Node via `node:test`, with a
  `vscode` fake (`test/stubs/`), so no VS Code download is needed. `npm test`
  runs these. `npm run test:coverage` adds line/branch/function coverage and
  fails below the configured thresholds (lines 80%, functions 80%, branches
  75%); current coverage is ~100% line / ~96% branch / ~98% function.
- **Integration tests** (`npm run test:integration`) activate the packaged
  extension inside a real VS Code Extension Host using `@vscode/test-electron`:
  they assert the extension activates, contributes its commands and setting
  defaults, round-trips a setting update, and runs a command.

### Running integration tests headless / behind an egress allowlist

`@vscode/test-electron` normally downloads VS Code from
`update.code.visualstudio.com` / `*.vscode-cdn.net`. In sandboxed environments
those hosts are often blocked by an egress allowlist (you'll see
`Failed to parse response from https://update.code.visualstudio.com … as JSON`
or `host_not_allowed`), so the download fails.

To run without contacting Microsoft hosts, provision a VS Code-compatible build
(VSCodium) from GitHub first:

```bash
npm run setup:test-editor          # downloads VSCodium into .vscode-test/
xvfb-run -a npm run test:integration
```

`setup:test-editor` writes the editor path to `.vscode-test/editor-path`, which
`.vscode-test.mjs` picks up via `useInstallation.fromPath` — no Microsoft host
is contacted. You can also point at any local install with
`VSCODE_TEST_FROM_PATH=/path/to/code`, or pin a VSCodium version with
`VSCODIUM_VERSION`. The launch args `--no-sandbox --disable-gpu
--disable-dev-shm-usage` are set so Chromium runs as root inside containers.

If you'd rather use the standard download, add these hosts to your egress
allowlist instead: `update.code.visualstudio.com`,
`vscode.download.prss.microsoft.com`, `*.vscode-cdn.net`.

CI runs both layers (`.github/workflows/vscode-extension.yml`) using the
VSCodium path so it's independent of Microsoft egress.
