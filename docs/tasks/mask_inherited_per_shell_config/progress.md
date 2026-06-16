# Progress: Let a workspace opt out of inherited per-shell configuration

## Status Legend

| Marker | Meaning |
| ------ | ------- |
| `[ ]` | Not started |
| `[x]` | Complete |
| `[~]` | In progress |
| `[!]` | Blocked or needs decision |
| `[-]` | Skipped / not applicable |

## Planning Checklist

- [x] Analyze current behavior.
- [x] Create analysis.md
- [x] Create PRD.md
- [x] Create implementation_plan.md
- [x] Create verification.md
- [x] Create progress.md

## Open Decisions

- [x] Precedence when the flag is true AND the workspace sets its own non-empty `wcli0.shells`.
  Resolved for v1: the flag suppresses per-shell mode entirely for the scope (all-or-nothing), as
  documented in the README and the setting's `markdownDescription`.
- [x] Whether the flag should be honored at any scope or only when effective at Workspace scope.
  Resolved: honored via the effective (deep-merged) value in `hasPerShellConfig`; documented that a
  User-scope value would disable per-shell mode everywhere.

## Phase 1: Setting and settings model

- [x] Add `wcli0.ignoreInheritedShells` to package.json
- [x] Add flag to `Wcli0Settings` and `buildSettings`
- [x] Gate `hasPerShellConfig` on the flag
- [x] settings.test.cjs gate tests
- [x] Verify tsc + settings unit test

## Phase 2: Provider gate

- [x] Confirm all launch/export sites branch on `hasPerShellConfig`
- [x] mcpProvider.test.cjs: CLI-flag launch when flag set
- [x] Verify provider unit tests

## Phase 3: Form control

- [x] Add `ignoreInheritedShells` to `FIELD_KEYS`
- [x] Render the toggle with hint text (tri-state select, Shells tab)
- [x] Wire `collect()` and `setVal()` (triBoolFields + inheritTriFields)
- [x] webviewShells.test.cjs round-trip
- [x] webview.test.cjs save does not clear `wcli0.shells`
- [x] Verify unit suite

## Phase 4: Integration test and documentation

- [x] README inherit-vs-mask section
- [x] extension.test.js deep-merge end-to-end test
- [x] Verify tsc + unit + integration + markdownlint

## Review Feedback

(Added when PR review feedback arrives. Each comment gets a checkbox.)
