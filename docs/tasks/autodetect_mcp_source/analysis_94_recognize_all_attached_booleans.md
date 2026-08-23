# Analysis 94 - Recognize all attached boolean values in wrapper suffixes

## Decision: Valid — fix applied

P87 taught `parseServerArgs` that yargs coerces every attached value other than exactly `true` to
false, but `isRecognizedServerFlag` — the detector that decides where a wrapper's own args end and
the wcli0 server-flag suffix begins — still counted only `=true` / `=false` as a modeled flag. The
two disagreed, so `wrapper target --enableTruncation=0` failed the modeled-evidence requirement
(P56), the whole suffix stayed in `customArgs`, and the form showed truncation ENABLED for an entry
that has it disabled. The flag was also uneditable, and turning it on from the form would have
appended a second, conflicting spelling.

The fix drops the literal check: any attached assignment whose flag is a declared boolean is
recognized. The two functions now apply the same rule, so anything the parser will model is
detectable as suffix evidence.

**Why:** These two predicates are a pair — the detector decides which tokens reach the parser, so
any spelling the parser understands must be recognized by the detector or it never gets the chance.
P76 established that pairing for attached booleans; this closes the gap P87 opened in it by widening
the parser alone. See [[analysis_87_model_every_attached_boolean]] and
[[analysis_76_attached_boolean_modeled_suffix]].

**Commit:** bfa5c70 - fix(vscode): round-20 codex review follow-ups for PR #89 (P93-P97)
