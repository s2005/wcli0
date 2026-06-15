# Analysis 40 - Allow the form to configure an empty executable argument list

## Decision: Valid — fix applied

`argLines()` returned `undefined` when the args textarea was blank and the loaded value was not an
array, even if the user had just typed a custom command. The collected `cfg.executable` then carried
only `command`, and the server's `applyPerShellOverrides` filled in the shell-specific default args
(`['/c']` for cmd, `['-c']` for bash/gitbash, etc.), invoking the custom executable with unwanted
prefix arguments. Gave `argLines` a `hasCmd` parameter: when a command is set, a blank args textarea
now yields an explicit `[]` ("invoke with no prefix args"); without a command, the prior behavior is
preserved (loaded-empty `[]` round-trips via round-4 P32, otherwise undefined).

**Why:** Custom executable commands are user-supplied end-to-end — the defaults exist to make the
*bundled* shell binaries behave like a login shell, which is meaningless for an arbitrary executable.
The form already supports `[]` as a meaningful value (round-2 P11, round-4 P32); the gap was specifically
that *entering a new command* with blank args didn't produce that `[]`. Threading `hasCmd` keeps the
existing lossless round-trip for already-configured args while closing the new-command hole.

**Commit:** b56a677 — fix(vscode): address Codex round-5 review feedback for PR #86
