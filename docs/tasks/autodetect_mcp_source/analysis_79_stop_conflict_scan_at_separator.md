# Analysis 79 - Stop conflict scanning at the option separator

## Decision: Valid — fix applied

The `yoloPresent` / `unsafePresent` scans that drive `safetyConflict` ran over the whole `args`
array, while everything else in `parseServerArgs` — the parse loop and the duplicate-scalar
pre-scan — stops at the `--` options separator (P74/P78). So `['--unsafe', '--', '--yolo']`, which
yargs runs in unsafe mode (the token after `--` is a positional and never defines `yolo`), was
reported as a mutually-exclusive pair: both safety tokens were preserved verbatim in `extraArgs`
and `safetyMode` stayed at the default `safe`. The form then showed the wrong protection level for
a server that really runs unsafe, and picking a different safety mode from that form would emit a
genuine `--yolo`/`--unsafe` conflict — turning a working entry into one the server rejects.

The fix slices `args` at the first `--` (`separatorAt` / `optionArgs`) and runs both presence scans
over that prefix only. A conflict written entirely before the separator is still detected and still
round-trips verbatim (P70/P71), and the separator plus its positionals still land in `extraArgs`
unchanged.

**Why:** The conflict check exists to mirror what yargs does with the entry, so it has to obey the
same option/positional boundary yargs does; scanning past `--` measured tokens the parser itself
never treats as options. Slicing once and reusing the prefix keeps the three scans in agreement
(loop, duplicate pre-scan, safety scan), which is the property every earlier separator fix relied
on. See [[analysis_74_stop_parsing_after_double_dash]] and
[[analysis_70_preserve_conflicting_safety_flags]].

**Commit:** e7a73ce - fix(vscode): round-16 codex review follow-ups for PR #89 (P79-P82)
