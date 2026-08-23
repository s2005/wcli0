# Analysis 108 - Exclude attached negations from modeled suffix evidence

## Decision: Valid — fix applied

P94 widened `isRecognizedServerFlag` to accept any attached value for a declared boolean, which is
right for `--debug=0` but wrong for a NEGATED spelling. Verified against the installed parser: yargs
applies `--name=value` before boolean negation, so `--no-debug=false` defines an unrelated `no-debug`
key and leaves `debug` untouched. `parseServerArgs` already preserves such a token verbatim, so the
detector was the only half that treated it as a wcli0 flag — enough to split a wrapper's own trailing
token into the "server suffix", after which an unrelated edit reordered the wrapper's invocation.

The detector now excludes attached values on `--no-*` spellings. A BARE `--no-debug`, which yargs
really does treat as a negation, still counts as modeled evidence and stays editable.

**Why:** The detector and the parser must agree about what is a wcli0 flag — the same pairing P94
itself was about. Excluding only the attached negated form keeps that agreement exact without
narrowing the P94 fix. See [[analysis_94_recognize_all_attached_booleans]] and
[[analysis_76_attached_boolean_modeled_suffix]].

**Commit:** cd74db6 - fix(vscode): address the five P2 findings missed by the #89 merge (P106-P110)
