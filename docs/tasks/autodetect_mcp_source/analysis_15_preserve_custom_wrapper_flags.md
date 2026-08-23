# Analysis 15 - Avoid stealing wrapper options that look like server flags

## Decision: Valid — fix applied

The custom-launcher boundary is now found by scanning for the START of the longest pure
wcli0 server-flag suffix (`serverFlagSuffixStart` + `isPureServerFlagRun`) rather than the
first recognized flag. Because the forward builder emits `[...customArgs, ...serverFlags]`,
the wcli0 flags are a contiguous suffix; a wrapper option that collides with a wcli0 flag
name (`--config wrapper.json` before `wcli0`) stays in `customArgs` because a later bare
token (`wcli0`) disqualifies the earlier run.

**Why:** Splitting at the first recognized flag stole the wrapper's `--config wrapper.json`
into settings and reordered it on Save, changing the launch. Suffix detection keeps the
launcher args in order. Covered by unit tests for the colliding-wrapper case and a
trailing-extraArg case; the existing uvx/custom round-trip tests still pass.

**Commit:** 3eccda7 — fix(vscode): address review feedback for PR #89 (round 3)
