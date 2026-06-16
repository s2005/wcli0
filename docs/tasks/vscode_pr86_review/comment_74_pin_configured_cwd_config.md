# P74 - Pin launches that use a configured cwd

`provideMcpServerDefinitions` in `vscode-extension/src/mcpProvider.ts` (line 204) only enables
managed pinning when the implicit home config exists. When `wcli0.launch.cwd` is configured and
contains a `config.json`, the provider launches from that cwd and the server's `loadConfig` loads
`<cwd>/config.json` before the home config, allowing it to silently replace shell executables or
disable the safety settings the provider definition represents.
