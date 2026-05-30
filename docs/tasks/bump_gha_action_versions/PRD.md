# PRD: Bump GitHub Actions to Node 24-Compatible Versions

## Objective

Update the pinned versions of the reusable GitHub Actions used in this
repository's CI/CD workflows so they run on a supported Action runtime
(Node 24). This removes the deprecation warnings GitHub now emits for actions
still bound to the Node 16/20 runtimes and prevents a forced, unmanaged runtime
migration on 2026-06-16.

## Background

GitHub is retiring older Node runtimes for JavaScript-based actions. Actions
pinned to deprecated runtimes are scheduled to be force-migrated to Node 24 on
2026-06-16. The CI logged a non-blocking warning recommending that the action
versions be bumped before that forced cutover.

The original warning referenced `actions/checkout@v4` and
`actions/setup-node@v3`. Inspection of the actual workflow files shows the
repository is, in fact, further behind than the warning implied:

| File | Action | Currently pinned | Occurrences |
| ---- | ------ | ---------------- | ----------- |
| `.github/workflows/build-and-test.yml` | `actions/checkout` | `@v3` | 3 |
| `.github/workflows/build-and-test.yml` | `actions/setup-node` | `@v3` | 3 |
| `.github/workflows/publish.yml` | `actions/checkout` | `@v4` | 1 |
| `.github/workflows/publish.yml` | `actions/setup-node` | `@v3` | 1 |

`actions/checkout@v3` and `actions/setup-node@v3` bind to the Node 16 runtime
(already deprecated); `actions/checkout@v4` binds to Node 20. All of these are
in scope for the forced Node 24 migration. Bumping each to the latest stable
major that ships the Node 24 runtime resolves the warning for all jobs.

This is a low-risk maintenance change. It does not alter workflow logic, the
test matrix, or the application code.

## Requirements

### REQ-1: Upgrade `actions/checkout` to a Node 24 runtime major

All four `actions/checkout` references (three in `build-and-test.yml`, one in
`publish.yml`) must be pinned to the latest stable major version that runs on
the Node 24 runtime (currently `@v5`). No `@v3` or `@v4` reference to
`actions/checkout` may remain.

### REQ-2: Upgrade `actions/setup-node` to a Node 24 runtime major

All four `actions/setup-node` references (three in `build-and-test.yml`, one in
`publish.yml`) must be pinned to the latest stable major version that runs on
the Node 24 runtime (currently `@v5`). No `@v3` reference to
`actions/setup-node` may remain.

### REQ-3: Preserve existing workflow behavior

The bump must be version-only. The `node-version` inputs, job structure, step
ordering, `with:` parameters (`registry-url`, etc.), triggers, and all custom
shell steps must remain unchanged. The CI must continue to pass on
`ubuntu-latest` and `windows-latest` exactly as before.

### REQ-4: No deprecation warnings remain

After the change, a CI run on the updated branch must not emit any
"deprecated Node version" / runtime-deprecation warnings attributable to
`actions/checkout` or `actions/setup-node`.

## Non-Requirements

- Bumping the test/build `node-version` (`18.x` / `18`) to a newer LTS. Node 18
  reaching end-of-life is a separate concern and is intentionally out of scope
  to keep this PR small; see analysis.md for a noted observation.
- Adding a Dependabot or other automated action-update configuration.
- Pinning actions to full commit SHAs (supply-chain hardening) instead of major
  tags.
- Refactoring, consolidating, or otherwise restructuring the workflow jobs.
- Any change to `src/`, tests, or runtime application behavior.

## Acceptance Criteria

1. No occurrence of `actions/checkout@v3` or `actions/checkout@v4` remains in
   `.github/workflows/`.
2. No occurrence of `actions/setup-node@v3` remains in `.github/workflows/`.
3. All `actions/checkout` and `actions/setup-node` references are pinned to the
   chosen Node 24 runtime major (e.g. `@v5`), consistently across both files.
4. `node-version` values and all other workflow content are byte-for-byte
   unchanged except for the action version tags.
5. The `Build and Test` workflow passes on a PR for `test-linux`,
   `test-windows`, and `test-windows-no-bash` jobs.
6. No action-runtime deprecation warnings appear in the updated workflow run.
7. YAML is valid (parses) and markdown planning docs pass `markdownlint-cli2`.

## Deliverables

| Deliverable | Type |
| ----------- | ---- |
| `.github/workflows/build-and-test.yml` | Update |
| `.github/workflows/publish.yml` | Update |
| `docs/tasks/bump_gha_action_versions/PRD.md` | Create |
| `docs/tasks/bump_gha_action_versions/analysis.md` | Create |
| `docs/tasks/bump_gha_action_versions/implementation_plan.md` | Create |
| `docs/tasks/bump_gha_action_versions/progress.md` | Create |
| `docs/tasks/bump_gha_action_versions/verification.md` | Create |
