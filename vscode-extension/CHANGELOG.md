# Changelog

## Unreleased

- Added support for named environment profiles (`wcli0.profiles`): a new
  **Profiles** tab in the configuration form, emission into the generated
  `config.json`, and an auto-managed `--config` launch whenever any profile is
  configured (profiles cannot be passed as CLI flags). `.vscode/mcp.json` export
  refuses while profiles are configured, mirroring per-shell settings.
- Added `wcli0.ignoreInheritedProfiles`: a Workspace-only opt-out that masks
  environment profiles inherited from User scope (which VS Code deep-merges and a
  workspace cannot otherwise remove). When enabled, inherited profiles no longer
  force the auto-managed `--config` launch or block the `.vscode/mcp.json` export.
  Mirrors `wcli0.ignoreInheritedShells`; exposed on the **Profiles** tab.
- The configuration form now loads and compares values per selected scope (User
  vs Workspace) via `inspect`, so editing one scope never surfaces or re-writes
  the other scope's values.
- Removed the unreachable pre-1.101 fallback path and older-version support
  claim; the MCP provider API is required (engine stays `^1.101.0`).

Addressed automated review findings so generated artifacts and the registered
server match how the wcli0 server actually interprets them:

- Generated `config.json` now disables unselected shells explicitly, preserves
  each shell's default per-shell restrictions (cmd `del`/`rd`/`rmdir`, gitbash
  `rm`), clears global and per-shell restrictions for `yolo`/`unsafe`, only lifts
  `restrictWorkingDirectory` when no paths are configured, and omits non-positive
  numeric limits.
- Launch args drop path values that don't resolve (e.g. `${workspaceFolder}` with
  no workspace) and force `--transport stdio` when a config file is referenced in
  stdio mode; invalid transport ports are rejected. `${workspaceFolder}` is left
  unresolved (not collapsed to an empty/root path) when no workspace is open.
- The provider no longer auto-registers legacy `sse` (warns instead), maps
  wildcard bind hosts to loopback and brackets IPv6 for the client URI, and
  defaults the process cwd to the workspace.
- `Write .vscode/mcp.json` validates the launch first, includes `cwd`, and
  refuses to overwrite an existing file that fails to parse.
- The configuration form saves only changed fields (no cross-scope leakage); the
  "restart" command is renamed to "Refresh MCP Server Definition"; `transport.port`
  is constrained to an integer in 1–65535.

Tooling:

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
