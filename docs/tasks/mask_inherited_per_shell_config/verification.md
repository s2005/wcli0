# Verification Plan: Let a workspace opt out of inherited per-shell configuration

## Purpose

Verify that the new `wcli0.ignoreInheritedShells` setting lets a Workspace scope escape managed
per-shell mode when User scope defines `wcli0.shells`, without regressing existing behavior, and that
the real VS Code deep-merge case is covered.

## Pre-Implementation Verification

Run from `vscode-extension/`.

### Existing Tests Pass

```bash
npx tsc --noEmit -p ./
node --require ./test/stubs/hook.cjs --test test/unit/*.test.cjs
npx vscode-test
```

Expected: all pass (current baseline is 319 unit + 12 integration).

### Coverage Baseline (Before)

| Module | Baseline Coverage | After Coverage | Delta |
| ------ | ----------------- | -------------- | ----- |
| settings.ts | -- % | -- % | -- % |
| webview.ts | -- % | -- % | -- % |
| mcpProvider.ts | -- % | -- % | -- % |

## Post-Implementation Verification

### Per-Phase Verification

- Phase 1: `npx tsc --noEmit` clean; `settings.test.cjs` shows `hasPerShellConfig` false when the flag
  is set with non-empty `shells`, true when unset.
- Phase 2: `mcpProvider.test.cjs` shows a CLI-flag launch (no managed `--config`) when the flag is set.
- Phase 3: `webviewShells.test.cjs` round-trips the toggle; `webview.test.cjs` shows saving the flag
  persists the boolean and leaves `wcli0.shells` untouched.
- Phase 4: `extension.test.js` shows the deep-merge case escapes per-shell mode with the flag set and
  returns to managed mode when unset.

### Linter

```bash
npx tsc --noEmit -p ./
npx markdownlint-cli2 "docs/tasks/mask_inherited_per_shell_config/*.md"
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

- [ ] With User `wcli0.shells` non-empty and the flag set at Workspace, the effective settings yield
  `hasPerShellConfig === false`.
- [ ] The provider registers a CLI-flag launch (no auto-managed `--config`) in that state.
- [ ] Disabling the flag restores managed per-shell mode.
- [ ] Clearing per-shell fields without the flag still inherits the User config.
- [ ] The control round-trips through save/reload at Workspace scope.
- [ ] Unit and integration suites pass; markdownlint passes; `tsc --noEmit` clean.
