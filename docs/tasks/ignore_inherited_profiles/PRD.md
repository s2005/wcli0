# PRD: Let a workspace opt out of inherited environment profiles

## Objective

Give the wcli0 configuration form (and the underlying settings model) an explicit way for a
Workspace scope to ignore the environment profiles (`wcli0.profiles`) inherited from User scope, so a
project can fully control its effective profile set instead of being permanently stuck with User
profiles merged in. This mirrors the `ignoreInheritedShells` opt-out and is the deferred P110 review
item from PR #87.

## Background

`wcli0.profiles` is an object-valued setting. When any meaningful profile is configured, the provider
stops emitting global CLI flags and instead launches the server against an auto-managed `--config`
file (`hasProfilesConfig` in `vscode-extension/src/settings.ts`), and `.vscode/mcp.json` export is
blocked. VS Code deep-merges object settings across scopes, so a User-scope `wcli0.profiles` is merged
into every workspace's effective value.

Today the form cannot express "this workspace wants no inherited profiles":

- Clearing the Profiles textarea produces `{}`, which the host converts to an unset key, removing the
  Workspace value. VS Code then re-merges the inherited User profiles, so the effective
  `wcli0.profiles` is unchanged and `hasProfilesConfig` stays true.
- Redefining an inherited profile at Workspace scope with only replacement env keys leaves the
  inherited env entries in place (deep object merge), so stale variables survive into the generated
  managed config.

These stale, inherited entries are written into the workspace managed config and keep the mcp.json
export blocked, contradicting the user's intent. The empty-textarea state is ambiguous: it could mean
"inherit from User" (today's behavior) or "do not use profiles here". This task introduces an explicit
control to disambiguate, plus the host logic to honor the "mask" intent.

Source: Codex review on PR #87, comment P110
(`vscode-extension/src/settings.ts` around line 209;
analysis in `docs/tasks/env_profiles/analysis_110_mask_inherited_profiles.md`).

## Requirements

### REQ-1: Explicit "ignore inherited profiles" control

The configuration form exposes a single, discoverable control (form-level toggle,
`ignoreInheritedProfiles`) that, when enabled at Workspace scope, declares that the workspace must not
use any environment profile regardless of what User scope defines. The control is only meaningful at
Workspace scope (User scope has nothing to inherit from), matching the `ignoreInheritedShells` control.

### REQ-2: Masking representation persisted at Workspace scope

When the control is enabled and saved at Workspace scope, the host persists an explicit Workspace-level
boolean that neutralizes the inherited profiles so the effective (merged) settings the provider reads
no longer satisfy `hasProfilesConfig`. The representation survives VS Code's deep-merge of
`wcli0.profiles` (i.e. it cannot rely on clearing or persisting `{}`).

### REQ-3: Provider and export honor the mask

With the mask active, `hasProfilesConfig` evaluates to false for the workspace, so:

- the provider (`vscode-extension/src/mcpProvider.ts`) does not force managed `--config` on account of
  profiles, and
- the `.vscode/mcp.json` export path (`commands.ts`) is no longer blocked by inherited profiles.

The generated/pinned config built by `buildConfigFile` emits no `profiles` when the mask is active.

### REQ-4: Round-trip and clear semantics preserved

Enabling, saving, reloading and disabling the control round-trips losslessly. Disabling the control
restores today's inherit behavior. Clearing the Profiles textarea WITHOUT enabling the control keeps
today's "inherit from User" behavior, so existing workflows are unaffected.

### REQ-5: Documentation

`README` / settings documentation and the contributed setting's `markdownDescription` explain the
inherit-vs-mask distinction and when to use the control.

## Non-Requirements

- No change to how User-scope profiles are authored or merged for users who want inheritance.
- No per-profile granular masking UI (mask profile A but inherit profile B); the control is
  all-or-nothing for the workspace in this iteration (matching the shells precedent).
- No change to the managed-config generation format itself or to the server's `profiles` schema.
- No change to multi-root folder-scoped (`workspaceFolderValue`) handling beyond what already exists
  for `ignoreInheritedShells`.

## Acceptance Criteria

1. With User `wcli0.profiles` non-empty and the new control enabled+saved at Workspace scope, the
   effective settings read by the provider yield `hasProfilesConfig === false`.
2. The generated config (`buildConfigFile`) emits no `profiles`, and the mcp.json export is no longer
   blocked by inherited profiles in that state.
3. A Global/User value of the flag does not suppress the user's own profiles (Workspace-only honoring,
   mirroring `ignoreInheritedShells` P101).
4. Disabling the control restores inherited-profiles behavior.
5. Clearing the Profiles textarea without enabling the control still inherits the User profiles
   (unchanged).
6. The control round-trips through save/reload at Workspace scope.
7. Unit tests cover the settings/host logic; an integration test covers the real VS Code deep-merge
   behavior end-to-end.
8. `tsc --noEmit`, the unit suite, the integration suite, and markdownlint all pass.

## Deliverables

| Deliverable | Type |
| ----------- | ---- |
| vscode-extension/package.json | Update |
| vscode-extension/src/settings.ts | Update |
| vscode-extension/src/configFile.ts | Update |
| vscode-extension/src/mcpProvider.ts | Update |
| vscode-extension/src/commands.ts | Update |
| vscode-extension/src/webview.ts | Update |
| vscode-extension/test/unit/settings.test.cjs | Update |
| vscode-extension/test/unit/configFile.test.cjs | Update |
| vscode-extension/test/unit/webviewProfiles.test.cjs | Update |
| vscode-extension/test/unit/commands.test.cjs | Update |
| vscode-extension/test/integration/extension.test.js | Update |
| vscode-extension/README.md | Update |
