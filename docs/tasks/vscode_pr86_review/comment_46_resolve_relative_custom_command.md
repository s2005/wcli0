# P46 - Resolve relative custom executable paths before provider launch

When `launch.customCommand` is a relative executable path such as `./bin/server`
and `launch.cwd` is unset, validation accepts it unchanged, but the provider
launches from a private extension directory, so the executable resolves there and
fails to start instead of resolving from the workspace. This also diverges from
an exported `mcp.json`, whose omitted cwd defaults to the workspace. Path-like
relative custom commands should be anchored, or rejected when no cwd is set.
Reported on `vscode-extension/src/argsBuilder.ts:309`.
