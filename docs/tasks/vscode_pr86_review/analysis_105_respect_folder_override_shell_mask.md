# Analysis 105 - Respect folder overrides for the shell mask

## Decision: Valid — fix applied

Changed `ignoreInheritedShellsAtWorkspace()` to honor `workspaceFolderValue` when it
is defined, falling back to `workspaceValue` only when the folder value is unset —
instead of ORing the two.

**Why:** VS Code resource-setting precedence makes a workspace-folder value override
the workspace value for that resource. The previous `info.workspaceFolderValue ===
true || info.workspaceValue === true` returned true even when a folder explicitly set
`ignoreInheritedShells=false` over a workspace `true`. That kept the per-shell mask on
for a folder that had deliberately opted back into per-shell config, so the provider
launched with global flags instead. Honoring the defined folder value first matches
VS Code's effective-value semantics; a Global value remains ignored (the mask stays a
Workspace-only affordance, per P101).

**Commit:** 5290bad — fix(vscode): address PR86 round-16 review (P103-P105)
