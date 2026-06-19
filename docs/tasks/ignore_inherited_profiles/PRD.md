# PRD: Mask inherited environment profiles (`wcli0.ignoreInheritedProfiles`)

## Problem

`wcli0.profiles` is read through VS Code's merged object setting, so User and
Workspace profile maps are deep-merged the same way `wcli0.shells` is. As a result:

- A workspace that clears the Profiles textarea cannot remove a profile inherited
  from User settings — the inherited profile still appears in `readSettings()`.
- Redefining an inherited profile at Workspace scope with only replacement env keys
  leaves the inherited env entries in place (deep object merge).

These stale, inherited entries are written into the workspace managed config and
keep the mcp.json export blocked, contradicting the user's intent.

Source: Codex review on PR #87, comment P110
(`vscode-extension/src/settings.ts` around line 209).

## Goal

Give profiles the same opt-out / replacement semantics already provided for
per-shell settings via `ignoreInheritedShells`, so a workspace can fully control
its effective profile set.

## Approach (mirror `ignoreInheritedShells`)

Use the existing `ignoreInheritedShells` implementation as the template. Touch
points to mirror:

- `vscode-extension/package.json` — add a `wcli0.ignoreInheritedProfiles` boolean
  setting (resource-scoped), documented as a Workspace-only affordance.
- `vscode-extension/src/settings.ts` — add `ignoreInheritedProfiles` to
  `Wcli0Settings` and `buildSettings`; recompute it Workspace-only in
  `readSettings` (mirror `ignoreInheritedShellsAtWorkspace`, honoring a defined
  workspace-folder value first per P105); force false for Global in
  `readSettingsForScope` (P101); add it to `INHERITABLE_SELECT_KEYS`; make
  `hasProfilesConfig` return false when set.
- `vscode-extension/src/configFile.ts` — in `buildConfigFile`, treat `profiles` as
  empty when `ignoreInheritedProfiles` is set (mirror the `shells: {}` masking).
- `vscode-extension/src/mcpProvider.ts` / `commands.ts` — ensure the
  managed-config gate and show/export paths respect the opt-out.
- `vscode-extension/src/webview.ts` — add the form control + scope availability /
  note (Workspace-only), mirroring the shells control.
- Tests across `settings.test.cjs`, `configFile.test.cjs`, `webview*.test.cjs`,
  `commands.test.cjs`, `mcpProvider.test.cjs`, plus integration coverage.
- `vscode-extension/README.md` — document the new setting.

## Out of scope

- Per-profile (rather than whole-map) masking. The shells precedent is a single
  opt-out toggle; match it unless review feedback asks for finer control.

## Acceptance

- With `wcli0.ignoreInheritedProfiles: true` at Workspace scope, inherited User
  profiles do not appear in the effective settings, the generated/pinned config,
  or the mcp.json export, and the export is no longer blocked by inherited profiles.
- A Global/User value of the flag does not suppress the user's own profiles.
- Existing profile behavior is unchanged when the flag is unset.
