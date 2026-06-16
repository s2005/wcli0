# P101 - Restrict the inherited-shell mask to Workspace scope

The contributed `wcli0.ignoreInheritedShells` setting is resource-scoped, so a user
can set it `true` in ordinary User Settings or `settings.json` even though the
config form disables the control at User scope. The unconditional check in
`settings.ts` (around line 256, `hasPerShellConfig`) then treats the merged
effective Global value as authoritative, suppressing the user's own `wcli0.shells`
in every workspace and when no workspace is open, contrary to the documented
Workspace-only opt-out. Honor the flag only when it is explicitly set at Workspace
(or workspace-folder) scope rather than trusting the merged effective boolean.
