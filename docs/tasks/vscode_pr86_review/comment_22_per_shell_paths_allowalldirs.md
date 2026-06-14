# P22 - Count per-shell paths before honoring allowAllDirs

When `allowAllDirs` is enabled, there are no global paths, and a managed per-shell
configuration supplies `overrides.paths.allowedPaths` or `initialDir`,
`buildConfigFile` still sets global `restrictWorkingDirectory` to false because it
only considers the global path settings. The shell inherits that false security
value, so its per-shell allowed paths are present in the generated config but
never enforced, leaving commands unrestricted despite the configured allowlist.
Include resolved per-shell paths when deciding whether `allowAllDirs` may disable
the restriction. Source: `vscode-extension/src/configFile.ts:236`.
