# Analysis 94 - Let workspaces mask inherited per-shell settings

## Decision: Rejected — already addressed by the `ignoreInheritedShells` opt-out (P87/P92)

This re-raises P87 ([[analysis_87_mask_inherited_per_shell_settings]]) and P92
([[analysis_92_mask_inherited_pershell_settings_read]]) at the form's empty-object site
(`vscode-extension/src/webview.ts:250`). The concern was resolved in a prior round by adding the
separate, non-merged `wcli0.ignoreInheritedShells` boolean: the Shells tab exposes an "Ignore
inherited per-shell config" control, and `hasPerShellConfig` returns false when it is set, so a
Workspace can return to the global CLI-flag path even though VS Code deep-merges `wcli0.shells`. That
is exactly the "explicit workspace-level representation that masks or disables inherited shells" the
reviewer asks for. No code change for this line.

**Why:** the `{}` → `undefined` conversion at line 250 is correct and must stay — clearing all
per-shell fields means "this workspace contributes no per-shell overrides" (inherit), not "mask".
Masking is a distinct, explicit action expressed by the `ignoreInheritedShells` toggle, not by
overloading the empty-fields state (persisting `{}` would deep-merge to a no-op and mask nothing, as
documented in P87). The UI hint at `webview.ts:536` already directs users to the Ignore control for
this purpose. Note P97 (this round) further restricts that toggle to Workspace scope, keeping the
opt-out coherent with its documented Workspace-only semantics.
