# P105 - Parse direct wcli0 arguments as one server argument list

In `vscode-extension/src/configSource.ts:413` (`serverFlagSuffixStart`), a direct entry containing a
positional between a boolean and its later negation -- `command: "wcli0", args: ["--allowAllDirs",
"marker", "--no-allowAllDirs"]` -- fails the index-zero purity check on `marker`, but the loop
continues and selects the final negation as a separate server suffix; `parseMcpEntry` consequently
stores the enabling flag in `customArgs` while modeling the suffix as false, and a no-op save omits
the false value and writes only `--allowAllDirs marker`, changing the server from restricted to
unrestricted directories. This is distinct from the earlier repeated-boolean parser case because the
positional causes the split before `parseServerArgs` runs; for a recognized direct wcli0 command the
complete argument list must be parsed or preserved rather than searching for a later suffix.

Reported in the review of 2026-08-23T19:28:04Z, on thread `PRRT_kwDOO7ppps6bhlg_`.
