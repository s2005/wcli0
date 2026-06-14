# P13 - Clear per-shell injection overrides in yolo and unsafe modes

When `safetyMode` is `yolo` or `unsafe` and a shell has
`overrides.security.enableInjectionProtection: true`, `applyPerShellOverrides`
writes that override and the `buildConfigFile` cleanup only clears restriction
lists. The server deep-merges the shell override over the global `false`, leaving
injection protection enabled for that shell, unlike the CLI `--yolo`/`--unsafe`
path (`applyCliUnsafeMode`) which explicitly sets shell
`overrides.security.enableInjectionProtection = false`. Source:
`vscode-extension/src/configFile.ts:333`.
