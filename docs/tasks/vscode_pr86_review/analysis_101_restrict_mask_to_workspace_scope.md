# Analysis 101 - Restrict the inherited-shell mask to Workspace scope

## Decision: Valid — fix applied

Confirmed bug. `wcli0.ignoreInheritedShells` is `scope: "resource"`, so a user can set it `true` in
User Settings / `settings.json` even though the config form disables the control at User scope
(`applyScopeAvailability`, P97). `readSettings` read the flag with `c.get` (the merged effective
value), so a Global value was honored: `hasPerShellConfig` (`settings.ts:256`) returned false and
`buildConfigFile` masked `shells` in every workspace, and even with no workspace open — contrary to the
documented Workspace-only opt-out.

Fix (`settings.ts`): in `readSettings`, recompute `ignoreInheritedShells` from `c.inspect()` and honor
it only when `workspaceFolderValue === true` or `workspaceValue === true` (new helper
`ignoreInheritedShellsAtWorkspace`); a Global/User value is ignored. `readSettingsForScope` is
similarly guarded to report it false for a `Global` target so a Global-scope export never masks. The
downstream consumers (`hasPerShellConfig`, `buildConfigFile`) are unchanged — they already read
`s.ignoreInheritedShells`, which now carries the Workspace-only truth.

**Why:** the opt-out's contract is a Workspace-scoped affordance to drop inherited per-shell config;
trusting the merged effective boolean let a User setting suppress the user's own per-shell config
globally. Restricting the read to Workspace/workspace-folder scope keeps User-scope per-shell config
working everywhere it should. Covered by a unit test in `settings.test.cjs` (P101): a Global-scoped
flag leaves `hasPerShellConfig` true and `readSettings().ignoreInheritedShells` false, while a
Workspace-scoped flag masks as before.

**Commit:** 9d969bf — fix(vscode): address PR86 round-15 review (P99-P102)
