# Analysis 97 - Restrict the inherited-shell mask to Workspace scope

## Decision: Valid — fix applied

Confirmed. The "Ignore inherited per-shell config" select (`vscode-extension/src/webview.ts`) was
shown unchanged for both scopes, so selecting it while editing User scope persisted
`ignoreInheritedShells: true` globally. Because `hasPerShellConfig` honors any effective true value,
a Global value suppresses the User scope's own `wcli0.shells` in every workspace and even with no
workspace open — contradicting the control's documented Workspace-only opt-out (it exists so a
Workspace can escape per-shell config inherited from User).

Fix: disable the control when the form loads User (Global) scope and show an explanatory note
(`applyScopeAvailability(scope)`, called from the init handler after `formScope` is set). The extension
writes this setting only through the form, so disabling it at User scope prevents the extension from
ever producing the problematic global value, while leaving it fully usable at Workspace scope. A
disabled, unchanged control is excluded from `collectChanged()`, so it is never persisted from User
scope.

**Why:** the chosen remedy is exactly the reviewer's primary suggestion ("disable or hide this control
for User scope") and matches the documented design. The deeper "a hand-edited Global value still masks"
case is an out-of-band settings.json edit that bypasses all form logic (a user can hand-break any
setting); a scope-aware change to the effective-read path (`readSettings`/`hasPerShellConfig`) was
considered but deliberately deferred to avoid destabilizing the merged-read used by the provider and
all export commands. Covered by two unit tests in `webviewShells.test.cjs` (P97): the control is
disabled with the note shown at Global scope, and enabled with the note hidden at Workspace scope.

**Commit:** d83e1c4 — fix(vscode): address PR86 round-14 review (P95-P98 per-shell mask, scope, display config)
