# P27 - Exclude disabled-shell paths from the allowAllDirs check

In `buildConfigFile` (vscode-extension/src/configFile.ts:249) `hasPerShellPaths` counts a
per-shell allowed path even when that shell is disabled via the `wcli0.shell` selector or
`shells.<name>.enabled: false`. With `allowAllDirs` enabled and only a disabled shell carrying a
path, the global `restrictWorkingDirectory` is still emitted as `true`, so enabled shells inherit an
empty global allowlist and their commands fail with `No allowed paths configured`. Only paths that
can constrain an enabled shell should keep the global restriction in place.
