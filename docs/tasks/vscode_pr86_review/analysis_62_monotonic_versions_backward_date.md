# Analysis 62 - Preserve monotonic versions when the local date goes backward

## Decision: Valid — fix applied

The bump script computed `build = prevDate === today ? prevBuild + 1 : 1`, which reset
the build counter and emitted a lower version (e.g. `0.20260614.1` from `0.20260615.1`)
whenever the local calendar date was earlier than the committed version's date. The
version computation is now extracted into a pure `computeNextVersion(prevVersion, today)`
that never moves the date slot backward: `date = today > prevDate ? today : prevDate`,
and the build counter only resets to 1 on a genuinely newer date, otherwise increments.
A backward local date keeps `prevDate` and bumps the build, so the version stays
monotonically increasing.

**Why:** date-based versions must increase monotonically or a Marketplace publish can be
rejected for being older than an already-published build; a US-timezone release build
shortly after a post-UTC-midnight commit is a realistic trigger. The file-IO `main()` is
now guarded by `require.main === module` so the pure function can be unit-tested without
side effects. Verified by `P62` tests in `bumpVersion.test.cjs` (new day resets, same
day increments, backward date stays monotonic).

**Commit:** 34888ec — fix(vscode): address Codex round-8 review feedback for PR #86
