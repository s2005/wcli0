# PRD: Let a workspace opt out of inherited per-shell configuration

## Objective

Give the wcli0 configuration form (and the underlying settings model) an explicit way for a
Workspace scope to ignore the per-shell configuration (`wcli0.shells`) inherited from User scope, so a
project can return to the global CLI-flag launch path instead of being permanently stuck in
managed per-shell mode. This is the deferred P87 review item from PR #86.

## Background

`wcli0.shells` is an object-valued setting. When any shell is configured there, the provider stops
emitting global CLI flags and instead launches the server against an auto-managed `--config` file
(`hasPerShellConfig` in `vscode-extension/src/settings.ts`). VS Code deep-merges object settings
across scopes, so a User-scope `wcli0.shells` is merged into every workspace's effective value.

Today the form cannot express "this workspace wants no per-shell config":

- Clearing all per-shell fields in the form produces `{}`, which `applySettings`
  (`vscode-extension/src/webview.ts`) converts to `undefined`, removing the Workspace key.
- VS Code then re-merges the inherited User object, so the effective `wcli0.shells` is unchanged and
  `hasPerShellConfig` stays true. The workspace can never reach the CLI-flag path.
- Overriding individual shells does not help: any value written (even `enabled: false`) is treated as
  "meaningful" by `isMeaningfulShellConfig`, keeping the launch in managed mode, and disabling every
  inherited shell would leave the server with no enabled shell.

The current empty-fields state is ambiguous: it could mean "inherit from User" (today's behavior) or
"do not use per-shell config here". This task introduces an explicit control to disambiguate, plus the
host logic to honor the "mask" intent.

## Requirements

### REQ-1: Explicit "ignore inherited per-shell config" control

The configuration form exposes a single, discoverable control (form-level toggle, e.g.
`ignoreInheritedShells`) that, when enabled at Workspace scope, declares that the workspace must not
use any per-shell configuration regardless of what User scope defines. The control is only meaningful
at Workspace scope (User scope has nothing to inherit from).

### REQ-2: Masking representation persisted at Workspace scope

When the control is enabled and saved at Workspace scope, the host persists an explicit Workspace-level
representation that neutralizes the inherited per-shell config so the effective (merged) settings the
provider reads no longer satisfy `hasPerShellConfig`. The representation survives VS Code's
deep-merge of `wcli0.shells` (i.e. it cannot rely on clearing or persisting `{}`).

### REQ-3: Provider honors the mask (returns to CLI-flag path)

With the mask active, `hasPerShellConfig` (and therefore the provider's managed-vs-CLI-flag decision in
`vscode-extension/src/mcpProvider.ts`) evaluates to false for the workspace, so the server launches
with global CLI flags rather than an auto-managed `--config` file.

### REQ-4: Round-trip and clear semantics preserved

Enabling, saving, reloading and disabling the control round-trips losslessly. Disabling the control
(unchecking it) restores today's inherit behavior. Clearing per-shell fields WITHOUT enabling the
control keeps today's "inherit from User" behavior, so existing workflows are unaffected.

### REQ-5: Documentation

`README` / settings documentation and the contributed setting's `markdownDescription` explain the
inherit-vs-mask distinction and when to use the control.

## Non-Requirements

- No change to how User-scope per-shell config is authored or merged for users who want inheritance.
- No per-shell granular masking UI (mask shell A but inherit shell B); the control is all-or-nothing
  for the workspace in this iteration.
- No change to the managed-config generation format itself.
- No change to multi-root folder-scoped (`workspaceFolderValue`) handling beyond what already exists.

## Acceptance Criteria

1. With User `wcli0.shells` non-empty and the new control enabled+saved at Workspace scope, the
   effective settings read by the provider yield `hasPerShellConfig === false`.
2. The provider registers a CLI-flag launch (no auto-managed `--config`) in that state.
3. Disabling the control restores managed per-shell mode (inheriting the User config).
4. Clearing per-shell fields without enabling the control still inherits the User config (unchanged).
5. The control round-trips through save/reload at Workspace scope.
6. Unit tests cover the settings/host logic; an integration test covers the real VS Code deep-merge
   behavior end-to-end.
7. `tsc --noEmit`, the unit suite, the integration suite, and markdownlint all pass.

## Deliverables

| Deliverable | Type |
| ----------- | ---- |
| vscode-extension/package.json | Update |
| vscode-extension/src/settings.ts | Update |
| vscode-extension/src/webview.ts | Update |
| vscode-extension/src/mcpProvider.ts | Update |
| vscode-extension/test/unit/settings.test.cjs | Update |
| vscode-extension/test/unit/webview.test.cjs | Update |
| vscode-extension/test/unit/webviewShells.test.cjs | Update |
| vscode-extension/test/integration/extension.test.js | Update |
| vscode-extension/README.md | Update |
