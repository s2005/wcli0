# Analysis 76 - Count attached boolean flags as modeled suffixes

## Decision: Valid — fix applied

`isRecognizedServerFlag` decides whether a token counts as a modeled wcli0 flag, which the wrapper
suffix detector (`requireModeled`) uses to confirm a suffix really is wcli0's. Its attached-form
check only consulted `VALUE_OPTIONS`, so a boolean assignment such as `--debug=true` or
`--enableTruncation=false` was not recognized. A wrapper entry like `wrapper target --debug=true`
therefore failed the modeled-flag requirement, the whole suffix stayed in `customArgs`, the form
showed the default, and a save left the original attached boolean in the launcher args — the user
could not edit or disable that flag.

The fix extends the attached-form branch of `isRecognizedServerFlag` to also recognize a flag whose
name is a `BOOLEAN_FLAGS` member when the value is the literal `true`/`false`. This exactly mirrors
what `parseServerArgs`/`applyAttachedBoolean` actually model (P72), so the suffix detector only
counts a token as modeled evidence when the parser would in fact model it. Any other attached value
(`--debug=verbose`) still does not count and round-trips verbatim.

**Why:** The suffix detector and the parser must agree on what "modeled" means, or a flag the parser
can handle gets stranded in `customArgs`. Restricting recognition to the literal `true`/`false`
keeps the two in lockstep and avoids treating an unmodeled value as false evidence of a wcli0
suffix. The fix threads alongside P77's `stdio` parameter on the same helper.

**Commit:** 9243e10 — fix(vscode): round-15 codex review follow-ups for PR #89 (P74-P78)
