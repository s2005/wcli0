# Analysis: Let a workspace opt out of inherited environment profiles

## Goal

Allow a Workspace scope to deterministically escape inherited profiles when User scope defines
`wcli0.profiles`, by adding an explicit "ignore inherited profiles" control and the host logic to honor
it. Resolves the deferred P110 item from PR #87.

## Current Behavior

- `vscode-extension/src/settings.ts`
  - `isMeaningfulProfile(p)` returns true if a profile has a non-dropped `allowedShells` and at least
    one non-empty, string-valued env key that still resolves after extension-owned-token expansion
    (mirrors every `buildProfiles` drop condition).
  - `hasProfilesConfig(s)` returns true if any profile with a non-blank name is meaningful. The
    provider uses this (alongside `hasPerShellConfig`) to choose managed config vs CLI flags, and the
    export command uses it to block `.vscode/mcp.json`.
  - `readSettings(scope)` reads the MERGED effective value (`config.get(key, def)`), which is what the
    provider launches from. For `ignoreInheritedShells`, `readSettings` overrides the merged read with
    a Workspace-only recompute (`ignoreInheritedShellsAtWorkspace`) so a stray User-scope value cannot
    suppress the user's own config everywhere (P101).
  - `readSettingsForScope(target, scope)` reads only the value stored at one scope (via `inspect`) to
    populate the form; it forces `ignoreInheritedShells = false` for Global.
  - `INHERITABLE_SELECT_KEYS` lists keys (including `ignoreInheritedShells`) where an explicit value at
    a scope masks the other scope; `explicitlySetSelectKeys` reports which are set.
- `vscode-extension/src/configFile.ts`
  - `buildConfigFile(sInput)` already masks shells when `ignoreInheritedShells` is set
    (`s = sInput.ignoreInheritedShells ? { ...sInput, shells: {} } : sInput`) before building, and
    calls `buildProfiles(s.profiles)` to emit the sanitized `profiles` block.
- `vscode-extension/src/mcpProvider.ts`
  - `provideMcpServerDefinitions` branches on `hasPerShellConfig(settings) || hasProfilesConfig(settings)`
    to decide managed-config vs CLI-flag launch.
- `vscode-extension/src/commands.ts`
  - The show/export paths gate on `hasPerShellConfig(settings) || hasProfilesConfig(settings)`.
- `vscode-extension/package.json`
  - `wcli0.profiles` is a `"type": "object"` setting with `scope: "resource"`. VS Code deep-merges such
    settings across User/Workspace/Folder. `wcli0.ignoreInheritedShells` is the boolean precedent.

## Feasibility

Feasible and well-bounded: this is the profiles twin of `ignoreInheritedShells`, which already
stabilized over review rounds P87–P105. VS Code's deep-merge of object settings means a Workspace value
cannot "remove" an inherited profile — it can only add or override keys, and any override is itself
meaningful to `isMeaningfulProfile`. The mask must therefore be carried by a SEPARATE boolean setting,
not by mutating `wcli0.profiles`.

## Approach

Introduce a new boolean setting, `wcli0.ignoreInheritedProfiles` (scope `resource`), honored
Workspace-only, that the effective settings reader consults. When true, `hasProfilesConfig` treats
`wcli0.profiles` as empty and `buildConfigFile` masks `profiles` to `{}`, so the provider does not
force managed mode on account of profiles and the mcp.json export is unblocked.

| Advantages | Disadvantages |
| ---------- | ------------- |
| Survives VS Code deep-merge: a Workspace boolean cleanly overrides a User boolean | Adds a new setting key to the schema and form |
| No need to mutate or mask the `wcli0.profiles` object itself | Behavior is all-or-nothing, not per-profile |
| Backward compatible: default false preserves today's inherit behavior | Two settings (`profiles` + the flag) now jointly determine the launch path |
| Reuses the proven `ignoreInheritedShells` mechanism end-to-end (read, mask, form, gating) | A user setting the flag globally would be ignored (Workspace-only), which must be documented |

### Rejected approach: persist `{}` or per-profile replacement masks

Persisting `{}` does not work (deep-merge re-adds User profiles). Writing a Workspace profile that
redefines an inherited one only deep-merges env keys, leaving stale inherited keys. Rejected as
incorrect.

## Implementation Notes

- Add `wcli0.ignoreInheritedProfiles` (boolean, default false, `scope: "resource"`) to `package.json`
  with a `markdownDescription` explaining inherit-vs-mask, mirroring `ignoreInheritedShells`.
- Extend the normalized settings (`buildSettings`/`Wcli0Settings`) with the flag; read it via
  `g<boolean>('ignoreInheritedProfiles', false)`.
- In `readSettings`, recompute it Workspace-only via a new `ignoreInheritedProfilesAtWorkspace(c)`
  helper (clone of `ignoreInheritedShellsAtWorkspace`, honoring a defined workspace-folder value
  before the workspace value), so a stray User/Global value does not suppress the user's own profiles.
- In `readSettingsForScope`, force the flag to `false` for Global (mirror `ignoreInheritedShells`).
- Add `'ignoreInheritedProfiles'` to `INHERITABLE_SELECT_KEYS` so the form's set/clear detection
  covers it.
- Make `hasProfilesConfig(s)` return `false` when `s.ignoreInheritedProfiles` is true (single
  authoritative gate, so the provider, show, and export paths all honor it).
- In `buildConfigFile`, treat `profiles` as empty when `ignoreInheritedProfiles` is set (mirror the
  existing `shells: {}` masking), so the generated/pinned config emits no `profiles`.
- Form (`webview.ts`): add the toggle to the field model and the Profiles tab, render it as a
  Workspace-relevant tri-state/boolean control with hint text, and drive the isolation chip
  (`hasProfilesConfig` mirror) from it.
- Verify the provider/commands sites all branch on `hasProfilesConfig` (no direct `s.profiles`
  inspection that would bypass the gate).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| New setting interacts subtly with deep-merge precedence | Honor it Workspace-only via the dedicated recompute; add an integration test for real merge |
| Users confused by inherit-vs-mask | Clear `markdownDescription` and README section; hint text in the form |
| Flag set at User scope unexpectedly disables profiles everywhere | Honor only at Workspace scope (mirror P101); document |
| Unit stub models replace, not deep-merge | Add an integration test that sets User + Workspace values in a real VS Code host |
| A site inspects `s.profiles` directly instead of `hasProfilesConfig` | Audit provider/commands/webview; route all launch/export decisions through `hasProfilesConfig` |

## Test Strategy

- Unit (`settings.test.cjs`): `hasProfilesConfig` returns false when the flag is set even with a
  non-empty `profiles`; true when the flag is false; the Workspace-only recompute ignores a
  Global-only value.
- Unit (`configFile.test.cjs`): `buildConfigFile` emits no `profiles` key when the flag is set.
- Unit (`webviewProfiles.test.cjs`): the toggle round-trips through save/collect; saving the flag
  persists the boolean and does not clear `wcli0.profiles`.
- Unit (`commands.test.cjs`): the export path is not blocked by inherited profiles when the flag is set.
- Integration (`extension.test.js`): set User `wcli0.profiles` + Workspace
  `wcli0.ignoreInheritedProfiles` in a real host; assert the effective config drops out of profiles
  mode (the deep-merge case the unit stub cannot model), then unset and assert it returns.
