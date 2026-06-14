# P21 - Drop relative config paths when no workspace can anchor them

When the Generate Config File command is used without an open workspace and a User
setting contains a relative allowed directory, initial directory, log directory,
or per-shell path, `resolveConfigPath` emits the relative value unchanged even
though it promises an absolute path. The server later C-roots such values via
`normalizeWindowsPath`, so the generated config can allow or use an unrelated
directory such as `C:\src`. Return `undefined` when `base` is absent, matching the
launch-path handling. Source: `vscode-extension/src/configFile.ts:50`.
