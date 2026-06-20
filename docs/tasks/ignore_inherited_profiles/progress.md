# Progress: Let a workspace opt out of inherited environment profiles

## Status Legend

| Marker | Meaning |
| ------ | ------- |
| `[ ]` | Not started |
| `[x]` | Complete |
| `[~]` | In progress |
| `[!]` | Blocked or needs decision |
| `[-]` | Skipped / not applicable |

## Origin

Deferred from PR #87 Codex review comment P110 (see
`docs/tasks/env_profiles/analysis_110_mask_inherited_profiles.md`). The P110 review thread is left
unresolved upstream with a reply pointing to this task. Mirrors the shipped `ignoreInheritedShells`
feature (`docs/tasks/mask_inherited_per_shell_config/`).

## Planning Checklist

- [x] Analyze current behavior.
- [x] Create analysis.md
- [x] Create PRD.md
- [x] Create implementation_plan.md
- [x] Create verification.md
- [x] Create progress.md

## Open Decisions

- [x] Carry the mask via a separate boolean (`wcli0.ignoreInheritedProfiles`) rather than mutating
  `wcli0.profiles`. Resolved: VS Code deep-merge means a Workspace object value cannot remove an
  inherited profile, so a separate boolean is required (matches `ignoreInheritedShells`).
- [x] Scope at which the flag is honored. Resolved: honored Workspace-only via a dedicated recompute in
  `readSettings` (mirror `ignoreInheritedShellsAtWorkspace`/P101), so a stray User/Global value does
  not suppress the user's own profiles everywhere.
- [ ] Precedence when the flag is true AND the workspace sets its own non-empty `wcli0.profiles`.
  Proposed for v1: the flag suppresses profiles mode entirely for the scope (all-or-nothing), as
  documented; revisit own-vs-inherited precedence only if review asks.

## Phase 1: Setting and settings model

- [ ] Add `wcli0.ignoreInheritedProfiles` to package.json
- [ ] Add flag to `Wcli0Settings` and `buildSettings`
- [ ] Workspace-only recompute in `readSettings` (folder value precedence)
- [ ] Force false for Global in `readSettingsForScope`
- [ ] Add to `INHERITABLE_SELECT_KEYS`
- [ ] Gate `hasProfilesConfig` on the flag
- [ ] settings.test.cjs gate + Workspace-only recompute tests
- [ ] Verify tsc + settings unit test

## Phase 2: Config masking and gate

- [ ] Mask `profiles` to `{}` in `buildConfigFile` when the flag is set
- [ ] Confirm provider / show / export branch on `hasProfilesConfig`
- [ ] configFile.test.cjs: generated config omits `profiles` when flag set
- [ ] commands.test.cjs: export not blocked by inherited profiles when flag set
- [ ] Verify config/commands unit tests

## Phase 3: Form control

- [ ] Add `ignoreInheritedProfiles` to the form field model
- [ ] Render the toggle with hint text on the Profiles tab (Workspace-relevant)
- [ ] Wire collect/populate; drive the Profiles isolation chip
- [ ] webviewProfiles.test.cjs round-trip; save does not clear `wcli0.profiles`
- [ ] Verify unit suite

## Phase 4: Integration test and documentation

- [ ] README inherit-vs-mask section for profiles
- [ ] extension.test.js deep-merge end-to-end test
- [ ] Verify tsc + unit + integration + markdownlint

## Review Feedback

(Added when PR review feedback arrives. Each comment gets a checkbox.)
