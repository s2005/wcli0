# P61 - Strip preserved value flags when replacing them

In `vscode-extension/src/argsBuilder.ts` (around line 538) the duplicate-cleanup that
runs after a file-source round-trip only stripped the log-limit flags
(`--maxOutputLines` / `--maxReturnLines`). When a loaded entry contained a malformed
modeled option the parser kept verbatim in `extraArgs` — for example
`--commandTimeout bad` (unparseable number) or `--logDirectory --debug` (value is a
flag) — and the user then set that same field in the form, the save emitted both the new
typed flag and the preserved extra flag. yargs parses the repeated scalar option declared
in `src/index.ts` as an array, while `applyCliSecurityOverrides` / `applyCliLogging` expect
a number/string, so the edited value is ignored or can crash the server instead of
replacing the bad argument. The builder must strip every modeled value flag it is about to
emit, not just the two log-limit lines.
