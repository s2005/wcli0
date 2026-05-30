# Verification Plan: Bump GitHub Actions to Node 24-Compatible Versions

## Purpose

Verify that all `actions/checkout` and `actions/setup-node` references are
pinned to a Node 24 runtime major, that no other workflow content changed, and
that CI passes without runtime-deprecation warnings.

## Pre-Implementation Verification

### Existing Tests Pass

```bash
npm run lint
npm test
```

Expected: lint (`tsc --noEmit`) and the jest suite pass. (Baseline only — this
task does not change application code, so these are unaffected by the bump.)

### Baseline Action Pins (Before)

```bash
grep -rnE 'actions/(checkout|setup-node)@v[0-9]+' .github/workflows/
```

Expected baseline matches:

| File | Action | Tag | Count |
| ---- | ------ | --- | ----- |
| `build-and-test.yml` | `actions/checkout` | `@v3` | 3 |
| `build-and-test.yml` | `actions/setup-node` | `@v3` | 3 |
| `publish.yml` | `actions/checkout` | `@v4` | 1 |
| `publish.yml` | `actions/setup-node` | `@v3` | 1 |

### Coverage Baseline (Before)

| Module | Baseline Coverage | After Coverage | Delta |
| ------ | ----------------- | -------------- | ----- |
| N/A (no source changes) | -- % | -- % | -- % |

## Post-Implementation Verification

### Per-Phase Verification

Phase 1 — no stale pins remain:

```bash
grep -rnE 'actions/(checkout@v[34]|setup-node@v3)' .github/workflows/
```

Expected: no matches (exit code 1 / empty output).

Phase 1 — target pins present and consistent:

```bash
grep -rnE 'actions/checkout@v6' .github/workflows/    # expect 4 matches
grep -rnE 'actions/setup-node@v6' .github/workflows/  # expect 4 matches
```

(Target major confirmed as `v6` — the latest stable major bundling Node 24 at
implementation time. `v5` also bundles Node 24; `v6` was preferred per the
implementation plan's "prefer the newest Node 24 major" guidance.)

Phase 1 — only version tags changed:

```bash
git diff -- .github/workflows/
```

Expected: every changed line is a `uses:` action version tag; no changes to
`node-version`, `with:` inputs, triggers, or shell steps.

Phase 2 — CI run on the PR:

- `test-linux`, `test-windows`, `test-windows-no-bash` all green.
- Run logs contain no "deprecated Node version" / runtime-deprecation warnings.

### Linter

```bash
npm run lint
npx markdownlint-cli2 "docs/tasks/bump_gha_action_versions/*.md"
```

Expected: both pass.

### Regression Check

```bash
npm test
```

Expected: all pass, unchanged from baseline.

## Final Acceptance Verification

The feature can be accepted when all items are true:

- [ ] No `actions/checkout@v3` or `actions/checkout@v4` in `.github/workflows/`.
- [ ] No `actions/setup-node@v3` in `.github/workflows/`.
- [ ] All 4 `checkout` and 4 `setup-node` refs pinned to the Node 24 major.
- [ ] `node-version` and all other workflow content unchanged.
- [ ] `Build and Test` passes for all three jobs on the PR.
- [ ] No action-runtime deprecation warnings in the run logs.
- [ ] Planning docs pass `markdownlint-cli2`.
