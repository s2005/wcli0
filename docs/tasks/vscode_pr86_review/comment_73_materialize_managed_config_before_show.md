# P73 - Materialize the managed config before showing its command

`showLaunchCommand` in `vscode-extension/src/commands.ts` (line 262) only computes the managed-config
pathname when per-shell settings are active; it never writes `buildConfigFile(settings)` there
before displaying and offering to copy the command. The referenced file may therefore be missing or
hold a provider-generated config for different effective settings, so running the displayed command
can fall back to an implicit config or execute stale shell/safety settings.
