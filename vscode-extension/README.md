# wcli0 — MCP Server (VS Code extension)

Configure and run the [`wcli0`](https://github.com/s2005/wcli0) MCP
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
  logging, transport) as well as per-shell configuration (enable/disable each
  shell, custom executables, and per-shell overrides).
- **Generates artifacts on demand:**
  - `wcli0: Generate config.json From Settings` writes a `wcli0` JSON config
    file (the `--config` format).
  - `wcli0: Write .vscode/mcp.json` writes a workspace `mcp.json` entry for
    clients that read that file directly.
  - `wcli0: Show Resolved Launch Command` prints the exact command line.

  When triggered from the configuration panel's buttons, these export actions
  first persist the form's current edits to the selected scope, so the generated
  output always matches what you see (no separate "Save settings" click needed).

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

### Per-shell configuration (`wcli0.shells`)

The single `wcli0.shell` flag only selects **one** shell. To configure shells
**individually** — enable an arbitrary subset, point a shell at a custom
executable, or give one shell different limits/blocklists/paths than another —
use `wcli0.shells`, an object keyed by shell name (`powershell`, `cmd`,
`gitbash`, `wsl`, `bash`). Edit it from the **Per-Shell Configuration** section
of the Configure panel.

Per shell you can set:

| Field | Meaning |
| ----- | ------- |
| `enabled` | Whether this shell is enabled. |
| `executable.command` / `executable.args` | Override the shell executable and its arguments. |
| `overrides.security.*` | Per-shell `maxCommandLength`, `commandTimeout`, `enableInjectionProtection`, `restrictWorkingDirectory`. |
| `overrides.restrictions.*` | Per-shell `blockedCommands` / `blockedArguments` / `blockedOperators` (replaces this shell's default blocklist). |
| `overrides.paths.allowedPaths` | Per-shell allowed paths (supports `${workspaceFolder}`). |
| `wslConfig.*` | `mountPoint` / `inheritGlobalPaths` (wsl/bash only). |

Per-shell settings **cannot** be passed as CLI flags, so whenever `wcli0.shells`
configures at least one shell the extension switches to an **auto-managed config
file**: it writes a generated `config.json` into its private storage and launches
the server with `--config <that file>`. In this mode `wcli0.shell` and the global
limit/restriction/path flags are bypassed (their values are folded into the
generated file instead), and any `wcli0.configFile` you set is ignored in favor
of the managed file. **Restart the MCP server** (from the MCP view) to apply
changes. Use `wcli0: Show Resolved Launch Command` to see the managed `--config`
command and the file's location.

#### Ignoring inherited per-shell configuration (`wcli0.ignoreInheritedShells`)

`wcli0.shells` is an object setting, and VS Code **deep-merges** object settings
across scopes. That means a per-shell configuration set in **User** settings is
merged into every workspace's effective value, and a workspace **cannot remove**
an inherited shell entry by clearing `wcli0.shells` — clearing only drops the
workspace's own override, leaving the inherited User value in effect, so the
workspace stays in auto-managed per-shell mode.

To let a single project opt out, enable `wcli0.ignoreInheritedShells` at the
**Workspace** scope (the **Shells** tab of the Configure panel). It is a separate
boolean — not part of the merged `wcli0.shells` object — so it cleanly overrides
the inherited value. When set, the extension ignores per-shell configuration for
that workspace and launches with the **global CLI flags** (`wcli0.shell` and the
global limit/restriction/path flags) instead of an auto-managed `--config` file.

Leave it off (the default) to inherit and use per-shell configuration as before.
Clearing the per-shell fields **without** enabling this flag keeps today's
inherit behavior. The flag is all-or-nothing for the scope: it disables per-shell
mode entirely rather than masking individual shells.

### Environment profiles (`wcli0.profiles`)

Named environment profiles let a single server run the same CLI tool under
different environment variable sets, selected per call via the optional
`profile` parameter on `execute_command` (for example testing the same SQL
against several `sqlplus` versions, each with its own `ORACLE_HOME`, `TNS_ADMIN`
and `PATH`). Configure them with `wcli0.profiles`, an object keyed by profile
name, from the **Profiles** tab of the Configure panel.

Per profile you can set:

| Field | Meaning |
| --------------- | ------------------------------------------------------------------------------------------- |
| `env` | **Required.** Map of environment variable names to string values merged into the command's environment. Values support `${VAR}` interpolation resolved by the **server** against its own environment (e.g. `C:/oracle/19/bin;${PATH}`). |
| `description` | Optional summary surfaced in the `execute_command` tool description. |
| `allowedShells` | Optional list restricting the profile to specific shells (`powershell`, `cmd`, `gitbash`, `wsl`, `bash`). Omit to allow every shell. |

```json
{
  "wcli0.profiles": {
    "ora19": {
      "description": "Oracle 19c client",
      "allowedShells": ["cmd", "powershell"],
      "env": {
        "ORACLE_HOME": "C:/oracle/19",
        "PATH": "C:/oracle/19/bin;${PATH}"
      }
    }
  }
}
```

Like per-shell settings, profiles **cannot** be passed as CLI flags, so whenever
any profile is configured the extension switches to the **auto-managed config
file** launch (the same `--config` mechanism described above) and `.vscode/mcp.json`
export is unavailable. A profile with an empty `env` is dropped (the server
rejects it). `${workspaceFolder}` and `${userHome}` in a value are resolved when
the config is generated; server-resolved tokens such as `${PATH}` are left intact.
**Restart the MCP server** to apply changes.

#### Ignoring inherited profiles (`wcli0.ignoreInheritedProfiles`)

`wcli0.profiles` is an object setting, so VS Code **deep-merges** it across scopes
just like `wcli0.shells`. A profile set in **User** settings is merged into every
workspace's effective value, and a workspace **cannot remove** an inherited
profile by clearing the Profiles editor — clearing only drops the workspace's own
override, leaving the inherited User profile in effect (so the workspace stays in
auto-managed mode and `.vscode/mcp.json` export stays blocked).

To let a single project opt out, enable `wcli0.ignoreInheritedProfiles` at the
**Workspace** scope (the **Profiles** tab of the Configure panel). It is a
separate boolean — not part of the merged `wcli0.profiles` object — so it cleanly
overrides the inherited value. When set, the extension ignores profiles for that
workspace: they no longer force the auto-managed `--config` launch and no longer
block the `.vscode/mcp.json` export.

Leave it off (the default) to inherit and use profiles as before. The flag is
all-or-nothing for the scope, and is honored only at the Workspace scope (a User
value would suppress your own profiles everywhere, so the form disables the
control there).

### User vs. workspace

Set machine-wide defaults in **User** settings (e.g. launch method, package
version, global blocked commands). Override per project in **Workspace**
settings (e.g. `allowedDirectories: ["${workspaceFolder}"]`). Workspace values
win, matching VS Code's normal settings precedence. The Configure panel lets you
target either scope explicitly.

## Transport

VS Code's built-in MCP integration uses **stdio** — keep `wcli0.transport.mode`
at `stdio` for the automatic provider. Selecting `http` is intended for an
already-running server: the provider auto-registers a connection to
`http://<host>:<port>/mcp` and assumes you run the server yourself. Selecting
`sse` is **not** auto-registered (VS Code's API exposes only the modern
Streamable HTTP transport, not legacy SSE); use the **Write `.vscode/mcp.json`**
command to add an SSE entry and run the server yourself.

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

### Icons

There are two icons, with different requirements:

- **Activity-bar icon** (`media/activity-icon.svg`) — the sidebar view container
  icon. VS Code accepts an SVG here; it is monochrome and uses `currentColor` so
  it adapts to the theme.
- **Marketplace icon** (`media/icon.png`, referenced by the `icon` field in
  `package.json`) — shown in the Marketplace and the Extensions list. This **must
  be a PNG** of at least 128×128 (we ship 512×512); SVG is not accepted here.

The PNG is generated from the editable source `media/icon.svg`:

```bash
npm run build:icon            # media/icon.svg -> media/icon.png (512x512)
npm run build:icon -- --size 256
```

`scripts/build-icon.mjs` rasterizes with no extra npm dependencies, using the
first available tool: headless Chromium (Chrome/Edge — set `CHROME_PATH` to
override), then ImageMagick (`magick`/`convert`), then Inkscape. To change the
icon, edit `media/icon.svg` and re-run `npm run build:icon`, then commit the
regenerated `media/icon.png`.

## Testing

Two layers:

- **Unit tests** (`npm run test:unit`) cover the extension logic — CLI-flag
  building, launch-spec assembly, `config.json` generation, settings
  normalization, the MCP definition provider, the commands, the configuration
  webview, and activation. They run under plain Node via `node:test`, with a
  `vscode` fake (`test/stubs/`), so no VS Code download is needed. `npm test`
  runs these. `npm run test:coverage` adds line/branch/function coverage and
  fails below the configured thresholds (lines 80%, functions 80%, branches
  75%); current coverage is ~97% line / ~88% branch / ~84% function.
- **Integration tests** (`npm run test:integration`) activate the packaged
  extension inside a real VS Code Extension Host using `@vscode/test-electron`,
  opening the workspace fixture in `test/integration/fixtures/ws`. They assert the
  extension activates, contributes its commands and setting defaults, round-trips
  setting updates (including a per-shell configuration), and — to guard against
  dropped settings — write a real `.vscode/mcp.json` and verify that **every**
  supported setting (Limits & Safety, logging, restrictions, paths, shell,
  safety mode, transport) is represented in the generated entry.

### Running integration tests headless or without the VS Code download

`@vscode/test-electron` normally downloads VS Code on first run. When that
download isn't available or you want a deterministic, self-contained run, you can
instead provision a VS Code-compatible build (VSCodium) from GitHub:

```bash
npm run setup:test-editor          # downloads VSCodium into .vscode-test/
xvfb-run -a npm run test:integration
```

`setup:test-editor` writes the editor path to `.vscode-test/editor-path`, which
`.vscode-test.mjs` picks up via `useInstallation.fromPath`. You can also point at
any local install with `VSCODE_TEST_FROM_PATH=/path/to/code`, or pin a VSCodium
version with `VSCODIUM_VERSION`. The launch args `--no-sandbox --disable-gpu
--disable-dev-shm-usage` are set so Chromium runs as root inside containers.

CI runs both layers (`.github/workflows/vscode-extension.yml`) using the
provisioned editor so it doesn't depend on the on-demand download.
