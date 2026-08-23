# Analysis 85 - Require a nonempty package for the npx fast path

## Decision: Valid â€” fix applied

P82 tightened the npx fast path to require the leading `-y` but kept the older tolerance for a
missing package token (`args[1] === undefined`), so `npx -y` and `npx -y ""` still selected the
modeled npx launch. `buildLaunchSpec` substitutes an empty `packageSpec` with `wcli0@latest`, so an
unrelated save rewrote an incomplete invocation â€” one npx itself rejects, since it requires a package
or an explicit call â€” into a complete automatic install-and-run of wcli0. That is the same
save-changes-the-launch defect P82 fixed, in the half of the condition P82 left alone.

The fix requires a real package token: present, non-blank, and not dash-prefixed. `npx -y` and
`npx -y ""` now parse as a custom launch, where `npx` is the command and the remaining tokens
round-trip verbatim in `customArgs`, so a save reproduces the original entry exactly instead of
completing it.

**Why:** The launch method asserts a specific shape (`npx -y <pkg>`), and an entry with no package is
not that shape â€” modeling it means inventing a package the user never wrote. Falling through to
custom is the project's standing lossless escape for launcher shapes the form cannot represent, and
it costs nothing here because there are no server flags to strand. See
[[analysis_82_preserve_npx_install_confirmation]].

**Commit:** 869edb8 - fix(vscode): round-17 codex review follow-ups for PR #89 (P83-P86)
