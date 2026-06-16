# Analysis: Let a workspace opt out of inherited per-shell configuration

## Goal

Allow a Workspace scope to deterministically escape managed per-shell mode when User scope defines
`wcli0.shells`, by adding an explicit "ignore inherited per-shell config" control and the host logic
to honor it. Resolves the deferred P87 item from PR #86.

## Current Behavior

- `vscode-extension/src/settings.ts`
  - `isMeaningfulShellConfig(c)` returns true if a shell entry has `enabled`, an executable
    command/args, any security override, any restriction array, an allowedPaths array, or WSL config.
  - `hasPerShellConfig(s)` returns true if `isMeaningfulShellConfig` holds for any shell in
    `s.shells`. The provider uses this to choose managed config vs CLI flags.
  - `readSettings(scope)` reads the MERGED effective value (`config.get(key, def)`), which is what the
    provider launches from. `readSettingsForScope(target, scope)` reads only the value stored at one
    scope (via `inspect`), used to populate the form without leaking the other scope's values.
  - `OPTIONAL_STRING_KEYS` already models keys where an explicit empty value masks the other scope
    (configFile, cwd, initialDir, logDirectory) — a precedent for "mask the other scope" semantics.
- `vscode-extension/src/webview.ts`
  - `collectShells()` builds the `wcli0.shells` object from the form; an untouched form yields `{}`.
  - `applySettings()` converts an empty object value to `undefined` before `config.update`, so a
    cleared `wcli0.shells` is removed at the scope (then re-merged from User by VS Code).
  - `FIELD_KEYS` is the list of keys the form reads/writes; `setVal`/`collect` drive the form fields.
- `vscode-extension/src/mcpProvider.ts`
  - `provideMcpServerDefinitions` reads merged settings and branches on `hasPerShellConfig(settings)`
    to decide managed-config vs CLI-flag launch.
- `vscode-extension/package.json`
  - `wcli0.shells` is a `"type": "object"` setting with `scope: "resource"`. VS Code deep-merges such
    settings across User/Workspace/Folder.

## Feasibility

Feasible, but it is a feature with a design fork rather than a one-line fix, because VS Code's
deep-merge of object settings means a Workspace value cannot "remove" an inherited key — it can only
add or override keys, and any override is itself meaningful to `isMeaningfulShellConfig`. The mask must
therefore be carried by a SEPARATE setting (a boolean), not by mutating `wcli0.shells`.

## Approach

Introduce a new boolean setting, `wcli0.ignoreInheritedShells` (scope `resource`), that the effective
settings reader consults. When true at the effective scope, `hasPerShellConfig` treats `wcli0.shells`
as empty, so the provider takes the CLI-flag path.

| Advantages | Disadvantages |
| ---------- | ------------- |
| Survives VS Code deep-merge: a Workspace boolean cleanly overrides a User boolean | Adds a new setting key to the schema and form |
| No need to mutate or mask the `wcli0.shells` object itself | Behavior is all-or-nothing, not per-shell |
| Backward compatible: default false preserves today's inherit behavior | Two settings (`shells` + the flag) now jointly determine the launch path |
| Easy to test at the settings layer and to round-trip in the form | A user setting the flag globally would disable per-shell config everywhere (documented) |

### Rejected approach: persist `{}` or per-shell `enabled:false` masks

Persisting `{}` does not work (deep-merge re-adds User keys). Writing `enabled:false` for each
inherited shell keeps `isMeaningfulShellConfig` true (still managed mode) and would leave no enabled
shell. Rejected as both incorrect and harmful.

## Implementation Notes

- Add `wcli0.ignoreInheritedShells` (boolean, default false, `scope: "resource"`) to `package.json`.
- Extend the normalized settings (`buildSettings`/`Wcli0Settings`) with the flag.
- Make `hasPerShellConfig(s)` return false when `s.ignoreInheritedShells` is true (single
  authoritative gate, so the provider, `showLaunchCommand`, and `writeWorkspaceMcpJson` all honor it).
- Form: add the toggle to `FIELD_KEYS`, render it (Workspace-relevant; can be shown disabled/hidden at
  User scope), and wire `collect`/`setVal`. It is a normal scoped boolean, so existing tri-state/clear
  handling patterns apply.
- Decide UI placement: alongside the per-shell cards header with a clear hint ("Ignore per-shell
  configuration inherited from User settings; launch with global flags instead").
- Edge case: when the flag is true AND the workspace ALSO sets its own non-empty `wcli0.shells`,
  define precedence. Recommended: the flag means "ignore INHERITED config" — if the workspace sets its
  own shells, those still apply; only the merged-in User keys are ignored. Simplest correct
  implementation for v1: the flag suppresses per-shell mode entirely for the scope (document this), and
  revisit per-shell-vs-inherited precedence only if needed.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| New setting interacts subtly with deep-merge precedence | Gate solely on the effective (merged) flag via `readSettings`; add an integration test for real merge |
| Users confused by inherit-vs-mask | Clear `markdownDescription` and README section; hint text in the form |
| Flag set at User scope disables per-shell config everywhere | Document; consider only honoring it at Workspace effective scope if that proves surprising |
| Unit stub models replace, not deep-merge | Add an integration test that sets User + Workspace values in a real VS Code host |

## Test Strategy

- Unit (`settings.test.cjs`): `hasPerShellConfig` returns false when the flag is set even with a
  non-empty `shells`; true when the flag is false.
- Unit (`webview*.test.cjs`): the toggle round-trips through save/collect; saving the flag persists the
  boolean and does not clear `wcli0.shells`.
- Integration (`extension.test.js`): set User `wcli0.shells` + Workspace `wcli0.ignoreInheritedShells`
  in a real host; assert the effective config drops out of per-shell mode (the deep-merge case the
  unit stub cannot model).
