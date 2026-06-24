# Analysis 17 - Preserve npx launcher options before the package

## Decision: Valid — fix applied

The `npx` fast path now applies only when the package token (after an optional `-y`) is not
an option. An entry like `npx --package=wcli0 -- wcli0 --shell cmd` falls through to custom
parsing, so `npx` becomes the custom command and `--package=wcli0 -- wcli0` is preserved in
`customArgs` before the wcli0 server flags.

**Why:** Skipping only `-y` and assuming the next token is the package treated
`--package=wcli0` as the package spec and reordered the launcher on Save. Gating the npx
fast path on a non-option package token preserves the launcher verbatim. Covered by unit
tests for npx-with-options (custom) and plain npx (with and without `-y`).

**Commit:** 3eccda7 — fix(vscode): address review feedback for PR #89 (round 3)
