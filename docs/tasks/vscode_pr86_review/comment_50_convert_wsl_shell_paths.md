# P50 - Convert workspace paths for WSL shell overrides

When a Windows user configures a WSL shell allowlist with `${workspaceFolder}` or a
relative workspace path, `resolveConfigPath` emits a Windows path such as `C:\repo`
into `overrides.paths.allowedPaths`. The server's WSL validator (`validateWslPath`)
compares working directories such as `/mnt/c/repo` against these per-shell paths
without converting them, so every WSL execution is rejected despite being inside the
configured workspace. Convert these paths using the shell's WSL mount point before
writing the override.

File: `vscode-extension/src/configFile.ts:211`
