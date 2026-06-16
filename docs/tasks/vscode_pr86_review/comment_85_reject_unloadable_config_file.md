# P85 - Reject config files that cannot actually be loaded

In `vscode-extension/src/argsBuilder.ts:756`, a non-empty `wcli0.configFile` is accepted as long as
its path resolves, even when the file is missing, unreadable, a directory, or malformed JSON. The
provider then treats the setting as an explicit pin and skips its managed-config protection, while
the server's `loadConfig` catches the failure and falls back to `<cwd>/config.json` or
`~/.win-cli-mcp/config.json` - an unintended implicit config can replace shell executables or weaken
restrictions. Validate that the resolved file can be read and parsed before registering or exporting
the launch.
