# wsl/pathResolution

- **resolves allowed paths based on global and WSL-specific settings** – merges and converts Windows paths, respecting the `inheritGlobalPaths` flag.
- **ensures unique results and warns about unsupported UNC paths** – duplicates are removed and a warning is logged when global paths cannot be converted.
- **honors custom `wslMountPoint` values** – converted paths reflect the configured mount prefix.
