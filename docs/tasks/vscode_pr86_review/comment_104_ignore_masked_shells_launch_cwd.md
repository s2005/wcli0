# P104 - Ignore masked shells when checking launch cwd

With command-palette/effective exports, `readSettings()` can still contain
User-scope `wcli0.shells` while a Workspace has `wcli0.ignoreInheritedShells=true`;
`buildConfigFile()` masks those shells, but `launchCwdAffectsConfig()` still scans
them. If one inherited shell has a relative executable and `wcli0.launch.cwd` is
unresolved, `generateConfigFile()` keeps the cwd validation error and refuses to
write a config even though that cwd is not used by the masked config. Short-circuit
this helper when `ignoreInheritedShells` is set.

File: `vscode-extension/src/commands.ts` (line 63)
