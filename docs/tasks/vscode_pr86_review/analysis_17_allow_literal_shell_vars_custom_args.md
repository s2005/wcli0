# Analysis 17 - Allow literal shell variables in custom arguments

## Decision: Valid - fix applied

The round-1 `customArgs` validation used `isUnresolvable`, which flags any
`${...}` token, so a legitimate shell template such as `customArgs: ["-c", "echo ${FOO}"]`
was blocked. Added `hasUnresolvedExtensionVariable`, which only matches the tokens
the extension actually resolves (`${workspaceFolder}`, `${workspaceFolder:name}`,
`${userHome}`) and only when they remain unresolved after `resolveVariables`.
Switched the `customArgs` loop to that check, so unresolved `${workspaceFolder}`
still blocks but arbitrary shell `${...}` templates pass through verbatim.

**Why:** Custom arguments are arbitrary command arguments for the target process;
the extension is only responsible for the VS Code variables it resolves, not every
brace-style token. Refines the round-1 fix without losing its intent.

**Commit:** 07629c2 - fix(vscode): address Codex round-2 review feedback for PR #86
