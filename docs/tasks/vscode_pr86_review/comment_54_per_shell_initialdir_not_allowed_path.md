# P54 - Do not treat per-shell initialDir as an allowed path

When `allowAllDirs` is enabled and an enabled shell configures only
`overrides.paths.initialDir`, the `hasPerShellPaths` check keeps global
`restrictWorkingDirectory` enabled even though the server never promotes a per-shell
`initialDir` into `allowedPaths`. The resulting shell has restriction enabled with an
empty allowlist, so every command fails with "No allowed paths configured" instead of
honoring `allowAllDirs`. Only resolved per-shell `allowedPaths` should prevent the
restriction from being lifted.

File: `vscode-extension/src/configFile.ts:277`
