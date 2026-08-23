# Analysis 83 - Stop scanning generic wrappers after option separators

## Decision: Valid â€” fix applied

P75 stopped the server-flag suffix scan at a `--` separator only for the wcli0 binary itself
(`allowIndexZero`), on the reasoning that a wrapper's `--` is a pass-through separator whose
remainder belongs to the wrapped binary. That is true for the npx case P17 preserves, but not in
general: in `node --inspect dist/index.js -- --debug` the separator belongs to the invoked script,
so yargs leaves `--debug` positional. The scan nevertheless split it out as a server flag, the form
showed Debug enabled for a server running without it, and any newly saved flag was appended after
the same separator â€” written, reported as saved, reparsed as "set", and never actually read by the
server.

The scan now stops at `--` for every command, with one narrow exception: a wrapper separator
followed somewhere later by the wcli0 binary itself (`isWcli0Command`), which is the only shape that
proves a pass-through. There the scan resumes at the token after that binary, so
`npx --package=wcli0 -- wcli0 --shell cmd` still models `--shell` (P17). A second `--` after the
wrapped binary is that binary's own separator and stops the scan, exactly as for a direct wcli0
launch (P75).

**Why:** The suffix scan's job is to find tokens the server's yargs will read as options, so it must
respect the same option/positional boundary yargs does â€” the property P74, P75 and P79 each restored
in a different scanner. Requiring the wrapped binary to be visibly wcli0 keeps the one proven
pass-through working while defaulting every unrecognized wrapper to the lossless outcome: the
remainder stays in `customArgs` and round-trips verbatim, unmodeled but never misreported. See
[[analysis_75_no_server_suffix_past_double_dash]] and [[analysis_17_preserve_npx_launcher_options]].

**Commit:** 869edb8 - fix(vscode): round-17 codex review follow-ups for PR #89 (P83-P86)
