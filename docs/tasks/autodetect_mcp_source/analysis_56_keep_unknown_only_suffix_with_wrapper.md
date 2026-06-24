# Analysis 56 - Keep unknown-only suffix flags with wrapper args

## Decision: Valid — fix applied

`isPureServerFlagRun` now accepts a `requireModeled` flag and returns `seenModeled` (rather
than unconditionally `true`) when set. `serverFlagSuffixStart` passes `requireModeled` for a
non-wcli0 wrapper scan (`!allowIndexZero`), so an unknown-only suffix such as the wrapper's
own `--verbose` in `wrapper target --verbose` is no longer mistaken for a wcli0 server-flag
suffix: it stays in `customArgs` instead of moving into `extraArgs`. The wcli0 binary itself
(the index-0 case) keeps `requireModeled` false, so its unknown-only args remain legitimate
`extraArgs`.

**Why:** Without evidence of a modeled wcli0 flag there is no unambiguous server-flag
boundary, so the trailing `--verbose` belongs to the wrapper. Moving it into `extraArgs` made
a later save emit the generated server flags before it (`target --shell cmd --verbose`),
reordering the wrapper invocation. Requiring a modeled flag mirrors the existing P43/P15
boundary logic, and suffixes that DO contain a modeled flag (P15/P24/P42/P43) still split
exactly as before. See [[analysis_43_continue_scan_after_launcher_flag]] and
[[analysis_15_preserve_custom_wrapper_flags]].

**Commit:** 3727aec - fix(vscode): round-9 codex review follow-ups for PR #89 (P55/P56)
