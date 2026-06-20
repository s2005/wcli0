# P110 - Add a way to mask inherited profiles

Because `wcli0.profiles` is read through VS Code's merged object setting, User and
Workspace profile maps are deep-merged just like `wcli0.shells`. If a User profile
exists and a workspace clears the Profiles textarea or redefines the same profile
with only replacement env keys, the inherited profile/old env entries still remain
in `readSettings()`, so the provider keeps writing them into the workspace managed
config and the mcp.json export remains blocked. Profiles need the same opt-out or
replacement semantics as per-shell settings (`ignoreInheritedShells`) before the
effective settings are used for launch.

File: `vscode-extension/src/settings.ts` (line 209)
