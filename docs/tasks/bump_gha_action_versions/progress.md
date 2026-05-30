# Progress: Bump GitHub Actions to Node 24-Compatible Versions

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

## Phase 1: Bump action versions

- [x] Confirm latest Node 24 major for `actions/checkout` and
      `actions/setup-node`. Confirmed: `@v6` is the latest stable major for both
      and bundles Node 24 (v5 also bundles Node 24; v6 preferred per plan).
- [x] `build-and-test.yml` `test-linux`: bump `checkout` + `setup-node`.
- [x] `build-and-test.yml` `test-windows`: bump `checkout` + `setup-node`.
- [x] `build-and-test.yml` `test-windows-no-bash`: bump `checkout` + `setup-node`.
- [x] `publish.yml` `publish`: bump `checkout@v4` + `setup-node@v3`.
- [x] Grep: zero `@v3`/`@v4` references remain.
- [x] Grep: 4 `checkout` + 4 `setup-node` references at target tag (`@v6`).
- [x] YAML parses; diff is version-tags-only.

## Phase 2: Validate on CI

- [ ] Open PR with the workflow edits.
- [ ] `test-linux` passes.
- [ ] `test-windows` passes.
- [ ] `test-windows-no-bash` passes.
- [ ] No action-runtime deprecation warnings in the run logs.
- [ ] `publish.yml` change confirmed by diff + YAML parse.

## Review Feedback

(Section populated when PR review feedback arrives.)
