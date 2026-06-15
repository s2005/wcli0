# P82 - Ignore paths on shells with directory restriction disabled

In `buildConfigFile` (`vscode-extension/src/configFile.ts`), when `allowAllDirs` is true and an
enabled shell has both per-shell `allowedPaths` and `restrictWorkingDirectory: false`, those paths
still count as configured even though they cannot constrain that shell. The global restriction
therefore stays enabled with an empty global allowlist, so every other enabled shell that inherits
it rejects commands with "No allowed paths configured" instead of honoring `allowAllDirs`. Exclude
shells whose effective directory restriction is explicitly disabled.
