# P42 - Recognize Windows absolute paths on non-Windows hosts

Node's host-specific `path.isAbsolute()` returns false for valid Windows paths
such as `C:\Users\me` (and UNC paths) when the extension host runs under
WSL/Linux, so `resolvedPath`, `pathValue`, and `configFile.resolveConfigPath`
rewrite them relative to the workspace (for example `/ws/C:\Users\me`), breaking
configured allowed directories, cwd, config files, and node script paths.
Reported on `vscode-extension/src/argsBuilder.ts:36`.
