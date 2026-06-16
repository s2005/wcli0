# P105 - Respect folder overrides for the shell mask

In a multi-root workspace where `wcli0.ignoreInheritedShells` is true at Workspace
scope but explicitly false for this folder, VS Code's resource setting precedence
makes the folder value the effective one. `ignoreInheritedShellsAtWorkspace()` still
returns true because it ORs any true workspace value, so the provider keeps masking
`wcli0.shells` for that folder and launches with global flags even though the
narrower setting opted back into per-shell config. Honor `workspaceFolderValue` when
it is defined before falling back to `workspaceValue`.

File: `vscode-extension/src/settings.ts` (line 288)
