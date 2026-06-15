# P75 - Validate settings before generating config.json

`generateConfigFile` in `vscode-extension/src/commands.ts` (line 35) calls `buildConfigFile` without
first running the managed-config validation the provider applies. For accepted-but-invalid settings
such as `commandTimeout: 0.5`, an out-of-range per-shell security limit, or an unresolved per-shell
path, `buildConfigFile` silently drops the value and writes a runnable file that uses defaults or
different restrictions, so the generated artifact does not match the settings the user requested.
