# P83 - Apply the global WSL mount point to bash inheritance

In `buildConfigFile` (`vscode-extension/src/configFile.ts`), when managed config enables
`shells.bash.wslConfig.inheritGlobalPaths` and sets a non-default global `wcli0.wslMountPoint`, the
mount point is seeded only on `wsl`. The server then converts inherited Windows paths for bash using
its `/mnt/` default, so commands under the configured custom mount are rejected. The server's
`applyCliWslMountPoint` applies the value to both `wsl` and `bash`; the generated config must match.
