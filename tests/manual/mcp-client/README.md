# Manual MCP Client Smoke Test

This folder contains a small MCP client app for manual testing of the local `wcli0` server without any LLM integration.

## Prerequisites

- Build the server first from the repository root:

```bash
npm run build
```

## Install

From this folder:

```bash
npm install
```

## Prepare Local Restriction Config

Generate a local config file with `allowedPaths` and `initialDir` set to this folder:

```bash
npm run prepare:config
```

This generates:

- `wcli0-local-only.config.json`

## Run Examples

Run with default command (`ls`):

```bash
node ./mcp-ls-client.mjs . bash -f ./wcli0-local-only.config.json
```

Run a specific command:

```bash
node ./mcp-ls-client.mjs . bash -c "pwd" -f ./wcli0-local-only.config.json
```

Run with debug output:

```bash
node ./mcp-ls-client.mjs . bash -c "pwd" -f ./wcli0-local-only.config.json --debug
```

## Notes

- Use `--comand`, `--command`, or `-c` to provide a command.
- Use `--config` or `-f` to point to a config file.
- Use `--allowAllDirs` only if you want to bypass directory restrictions.
