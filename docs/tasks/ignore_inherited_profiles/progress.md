# Progress: Mask inherited environment profiles

## Status Legend

| Marker | Meaning                   |
| ------ | ------------------------- |
| `[ ]`  | Not started               |
| `[x]`  | Complete                  |
| `[~]`  | In progress               |
| `[!]`  | Blocked or needs decision |
| `[-]`  | Skipped / not applicable  |

## Origin

Deferred from PR #87 Codex review comment P110 (see
`docs/tasks/env_profiles/analysis_110_mask_inherited_profiles.md`).

## Checklist

- [ ] Add `wcli0.ignoreInheritedProfiles` setting to package.json
- [ ] Wire `ignoreInheritedProfiles` into `Wcli0Settings` / `buildSettings`
- [ ] Recompute Workspace-only in `readSettings` (folder value precedence)
- [ ] Force false for Global in `readSettingsForScope`
- [ ] Add to `INHERITABLE_SELECT_KEYS`
- [ ] Gate `hasProfilesConfig` off when set
- [ ] Mask `profiles` in `buildConfigFile` when set
- [ ] Respect opt-out in provider / show / export paths
- [ ] Add webview form control + Workspace-only scope availability
- [ ] Unit + integration tests
- [ ] Update README.md
- [ ] Verify `tsc --noEmit`, unit suites, markdown lint
