# Analysis 105 - Parse direct wcli0 arguments as one server argument list

## Decision: Valid — fix applied

For a direct `command: "wcli0"` entry the suffix scan had nothing to look for: every argument is
already the server's own. Scanning anyway could cut the list in the wrong place. With
`args: ["--allowAllDirs", "marker", "--no-allowAllDirs"]` the index-0 run failed the purity check on
the positional `marker`, so the scan moved on and picked the trailing `--no-allowAllDirs` as the
"server suffix". That left the ENABLING flag in `customArgs` and modeled `allowAllDirs` as false —
and because a false boolean is simply not emitted, a no-op save wrote back `--allowAllDirs marker`.
yargs reads that as allowAllDirs TRUE, so an unrelated edit flipped the server from restricted to
unrestricted directories.

The caller now takes the first of the review's two options: when `isWcli0Command(command)`, the
whole arg list is handed to `parseServerArgs` (`start = 0`) instead of being scanned. That parser
already implements yargs' own rules for this list — repeated booleans are last-wins (P89), and the
`--` separator plus its positionals are preserved verbatim in `extraArgs` (P74) — so the split
cannot land in the wrong place at all. The scan itself is now wrapper-only, and its dead
`allowIndexZero` parameter was removed rather than left as an unused branch.

Verified round-trips for a direct `wcli0` launch: `-- --debug` re-emits byte-identically with debug
still false; `--shell cmd -- --shell bash` re-emits byte-identically; and the reported case now
emits `marker` alone, which yargs resolves to allowAllDirs=false — the same restricted launch the
original entry produced, and never the unrestricted rewrite.

**Why:** Parsing beats preserving here because it keeps the entry editable: the flags stay modeled
in the form, and the round-trip is still faithful because the emitted args resolve to the identical
yargs result. The one visible change is that a boolean and its negation collapse to the value yargs
computes for them, which is the same normalization every other modeled field already gets. See
[[analysis_89_clear_safety_mode_on_later_false]] and [[analysis_75_no_server_suffix_past_double_dash]].
