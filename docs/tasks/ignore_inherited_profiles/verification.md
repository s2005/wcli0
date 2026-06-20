# Verification Plan: Let a workspace opt out of inherited environment profiles

## Purpose

Verify that the new `wcli0.ignoreInheritedProfiles` setting lets a Workspace scope escape inherited
profiles when User scope defines `wcli0.profiles`, without regressing existing behavior, and that the
real VS Code deep-merge case is covered.

## Pre-Implementation Verification

Run from `vscode-extension/`.

### Existing Tests Pass

```bash
npx tsc --noEmit -p ./
node --require ./test/stubs/hook.cjs --test test/unit/*.test.cjs
npx vscode-test
```

Expected: all pass (current baseline is 380 unit + 14 integration).

### Coverage Baseline (Before)

| Module | Baseline Coverage | After Coverage | Delta |
| ------ | ----------------- | -------------- | ----- |
| settings.ts | -- % | -- % | -- % |
| configFile.ts | -- % | -- % | -- % |
| webview.ts | -- % | -- % | -- % |

## Post-Implementation Verification

### Per-Phase Verification

- Phase 1: `npx tsc --noEmit` clean; `settings.test.cjs` shows `hasProfilesConfig` false when the flag
  is set with non-empty `profiles`, true when unset, and a Global-only flag value does not suppress the
  user's profiles.
- Phase 2: `configFile.test.cjs` shows the generated config omits `profiles` when the flag is set;
  `commands.test.cjs` shows the mcp.json export is not blocked by inherited profiles.
- Phase 3: `webviewProfiles.test.cjs` round-trips the toggle; saving the flag persists the boolean and
  leaves `wcli0.profiles` untouched.
- Phase 4: `extension.test.js` shows the deep-merge case escapes profiles mode with the flag set and
  returns when unset.

### Linter

```bash
npx tsc --noEmit -p ./
npx markdownlint-cli2 "docs/tasks/ignore_inherited_profiles/*.md"
```

Expected: 0 errors.

### Regression Check

```bash
node --require ./test/stubs/hook.cjs --test test/unit/*.test.cjs
npx vscode-test
```

Expected: all previously-passing tests still pass; new tests pass.

## Final Acceptance Verification

The feature can be accepted when all items are true:

- [ ] With User `wcli0.profiles` non-empty and the flag set at Workspace, the effective settings yield
  `hasProfilesConfig === false`.
- [ ] The generated config (`buildConfigFile`) emits no `profiles`, and the mcp.json export is no
  longer blocked by inherited profiles in that state.
- [ ] A Global/User value of the flag does not suppress the user's own profiles.
- [ ] Disabling the flag restores inherited-profiles behavior.
- [ ] Clearing the Profiles textarea without the flag still inherits the User profiles.
- [ ] The control round-trips through save/reload at Workspace scope.
- [ ] Unit and integration suites pass; markdownlint passes; `tsc --noEmit` clean.
