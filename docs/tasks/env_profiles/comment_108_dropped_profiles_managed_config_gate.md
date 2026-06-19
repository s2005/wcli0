# P108 - Avoid treating dropped profiles as managed config

When the only configured profiles are ones `buildProfiles` later omits — for
example their env values contain unresolved `${workspaceFolder}`/`${userHome}`
tokens (P106) or their `allowedShells` entries are all invalid (P107) — the raw
`hasProfilesConfig` check still returns true. In the stdio provider/show/export
paths that forces a managed `--config` and ignores any `wcli0.configFile`, but the
generated config contains no `profiles`, so a malformed profile silently removes
both the selected profile and the referenced config. Base the gate on the same
sanitized profile map before switching launch modes.

File: `vscode-extension/src/settings.ts` (line 332)
