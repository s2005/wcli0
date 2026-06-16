# Analysis 80 - Reject unresolved variables in per-shell executable commands

## Decision: Valid — fix applied

The per-shell executable-command check now flags any `${...}` token that remains after resolving the
extension's own `${workspaceFolder}`/`${userHome}` (via `hasUnresolvedVariables(resolveVariables(cmd))`)
rather than only the extension tokens, blocking commands such as `${SHELL_BIN}/sh`.

**Why:** the server passes `executable.command` straight to `spawn` without shell expansion
(`src/index.ts`), so any surviving token is a literal path component and the shell fails every spawn.
Executable ARGS keep the laxer `hasUnresolvedExtensionVariable` check because a shell may legitimately
expand a `${FOO}` argument, but the command itself cannot. Verified by an added `P80` test in
`argsBuilder.test.cjs` (an arbitrary `${SHELL_BIN}` token is rejected; a resolvable
`${workspaceFolder}` command is accepted).

**Commit:** fce0c44 — fix(vscode): address Codex round-11 review feedback for PR #86
