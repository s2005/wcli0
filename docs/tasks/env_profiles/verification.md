# Verification Plan: Named Environment Profiles for execute_command

## Purpose

Verify that named environment profiles let a single wcli0 server run commands under a selected environment (including a prepended `PATH`), that selection errors are clear, and that omitting a profile preserves current behavior exactly.

## Pre-Implementation Verification

### Existing Tests Pass

```bash
npm test
```

Expected: all tests pass.

### Lint Baseline

```bash
npm run lint
```

Expected: tsc `--noEmit` reports no errors.

### Coverage Baseline (Before)

| Module | Baseline Coverage | After Coverage | Delta |
| ------ | ----------------- | -------------- | ----- |
| src/index.ts | -- % | -- % | -- % |
| src/utils/config.ts | -- % | -- % | -- % |
| src/utils/envProfiles.ts | n/a | -- % | -- % |
| src/utils/toolSchemas.ts | -- % | -- % | -- % |

## Post-Implementation Verification

### Per-Phase Verification

#### Phase 1: Types and resolver

```bash
npm run build
npx jest tests/envProfiles.test.ts
```

Expected: build succeeds; interpolation and resolution unit tests pass.

#### Phase 2: Config validation

```bash
npx jest tests/envProfiles.test.ts
```

Expected: valid profiles load; invalid `allowedShells`, non-string env, and empty env are rejected with descriptive errors.

#### Phase 3: Runtime wiring

```bash
npm run test:integration
```

Expected: a command echoing a profile env var returns the profile value; `PATH` prepend ordering holds; unknown profile returns InvalidParams; a no-profile call leaves the environment unchanged.

#### Phase 4: Schema and description

```bash
npx jest tests/toolDescription.test.ts tests/envProfiles.test.ts
```

Expected: schema exposes optional `profile`; description lists configured profiles; both unchanged when no profiles are configured.

### Linter

```bash
npm run lint
npx markdownlint-cli2
```

Expected: no TypeScript errors; no markdown lint errors on changed files.

### Regression Check

```bash
npm test
```

Expected: full suite passes, including pre-existing tests.

## Final Acceptance Verification

The feature can be accepted when all items are true:

- [ ] Config with `profiles` loads; config without `profiles` behaves as before.
- [ ] Invalid profiles are rejected at load with descriptive errors.
- [ ] `execute_command` accepts optional `profile`; omission is backward compatible.
- [ ] Selected profile merges `{ ...process.env, ...interpolatedEnv }` into the child.
- [ ] `PATH` prepend via `${PATH}` verified by integration test reading child env.
- [ ] Unknown profile and disallowed-shell selections return InvalidParams errors.
- [ ] Tool description lists configured profiles.
- [ ] `npm test` and `npm run lint` are clean.
- [ ] README and configuration docs document the `profiles` config and `profile` parameter.
