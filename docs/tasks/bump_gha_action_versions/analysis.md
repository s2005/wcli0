# Analysis: Bump GitHub Actions to Node 24-Compatible Versions

## Goal

Eliminate the GitHub Actions runtime-deprecation warning by pinning
`actions/checkout` and `actions/setup-node` to the latest stable major that
ships the Node 24 runtime, ahead of the forced migration on 2026-06-16.

## Current Behavior

The repository has two workflows under `.github/workflows/`:

- `build-and-test.yml` — runs on `push`/`pull_request` (paths-ignore for docs
  and markdown) and `workflow_dispatch`. Three jobs:
  - `test-linux` (`ubuntu-latest`): `actions/checkout@v3` (line 19),
    `actions/setup-node@v3` (line 21), `node-version: 18.x` (line 23).
  - `test-windows` (`windows-latest`): `actions/checkout@v3` (line 39),
    `actions/setup-node@v3` (line 41), `node-version: 18.x` (line 43).
  - `test-windows-no-bash` (`windows-latest`): `actions/checkout@v3` (line 56),
    `actions/setup-node@v3` (line 57), `node-version: 18.x` (line 59), plus a
    series of custom `pwsh`/`cmd` steps that strip Git Bash / `ls` from PATH.
- `publish.yml` — runs on `release: published` and `workflow_dispatch`. One
  `publish` job (`ubuntu-latest`): `actions/checkout@v4` (line 16),
  `actions/setup-node@v3` (line 17) with `registry-url`, `node-version: '18'`.

Runtime binding of the currently pinned majors:

| Action / tag | Bundled Node runtime | Status |
| ------------ | -------------------- | ------ |
| `actions/checkout@v3` | Node 16 | Deprecated |
| `actions/checkout@v4` | Node 20 | In scope for forced Node 24 migration |
| `actions/setup-node@v3` | Node 16 | Deprecated |

The build tooling itself is npm-based (no `make`): `npm run build`
(`tsc && chmod +x`), `npm run lint` (`tsc --noEmit`), `npm test` (jest via
`--experimental-vm-modules`), and `npm run test:debug`. These are invoked
directly by the workflow `run:` steps and are unaffected by the action version
bump.

## Feasibility

Straightforward and low-risk. The change is a set of version-tag edits on
`uses:` lines. `actions/checkout` and `actions/setup-node` maintain backward
compatibility across these majors for the inputs used here (`node-version`,
`registry-url`), so no `with:` changes are required. The work is mechanical and
fully validated by an actual CI run on a PR.

## Approach

Pin every `actions/checkout` and `actions/setup-node` reference to the latest
stable major that runs on Node 24. As of this writing that is `@v5` for both.

Two ways to express the pin were considered:

| Approach | Advantages | Disadvantages |
| -------- | ---------- | ------------- |
| Major-tag pin (`@v5`) | Matches the existing repo convention; auto-receives non-breaking patches; minimal diff | Tag is mutable; not supply-chain hardened |
| Full commit SHA pin | Immutable, supply-chain hardened | Larger diff; needs SHA lookup; diverges from current repo style; out of scope per PRD |

Recommended: **major-tag pin (`@v5`)**. It keeps the diff minimal, matches how
the repo already pins actions, and directly satisfies the deprecation fix. SHA
pinning is explicitly a non-requirement.

The implementer must confirm the latest stable major at PR time on the upstream
release pages (`actions/checkout`, `actions/setup-node`); if a newer major than
`v5` has shipped and bundles Node 24, prefer it, applying the same tag
consistently in both files.

## Implementation Notes

- Total edits: 4 `checkout` references (3x `@v3`, 1x `@v4`) and 4 `setup-node`
  references (4x `@v3`). All converge to the same target major.
- Keep `node-version: 18.x` and `node-version: '18'` exactly as-is (REQ-3).
- Keep the `registry-url: 'https://registry.npmjs.org'` input on the publish
  job's `setup-node` step.
- The original warning text named `checkout@v4`, but `build-and-test.yml`
  actually pins `checkout@v3`. Search for both `@v3` and `@v4` so no stale pin
  is missed.
- `publish.yml` cannot be exercised by a normal PR (it triggers on release).
  Validate it by YAML parse and visual diff; the runtime change is identical to
  the build workflow, which the PR does exercise.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| A newer major changed default behavior of an input we rely on | Inputs used (`node-version`, `registry-url`) are stable across these majors; a PR CI run confirms green before merge |
| Missing a reference (e.g. the lone `@v4` in publish.yml) | Grep for both `actions/checkout@` and `actions/setup-node@` across `.github/workflows/`; assert zero `@v3`/`@v4` remain |
| `publish.yml` change cannot be tested by PR CI | Validate via YAML parse + diff review; behavior mirrors the validated build workflow |
| Node 18 EOL surfaces as a separate failure later | Out of scope here; recorded as an observation for a future follow-up, not blocking this PR |

## Test Strategy

No application code changes, so unit/integration coverage is unaffected. The
verification is workflow-level:

- Static: grep assertions that no `@v3`/`@v4` action pins remain; YAML validity
  check; markdown lint on the planning docs.
- Dynamic: open the PR and confirm `test-linux`, `test-windows`, and
  `test-windows-no-bash` all pass, and that the run log contains no
  action-runtime deprecation warnings.
