# Analysis 51 - Anchor relative per-shell executable commands

## Decision: Valid — fix applied

`applyPerShellOverrides` now resolves a per-shell `executable.command` through a new
`resolvePerShellCommand` helper that anchors a path-like RELATIVE command (e.g.
`./tools/bash`) to the workspace folder when no `wcli0.launch.cwd` is set — the same
rule `customCommandValue` already applies to the custom launch command. A bare PATH
command and an absolute command are left untouched, and `validateLaunchSpec` (managed)
now blocks an unanchorable relative command via `isUnanchorablePerShellCommand`.

**Why:** A managed launch deliberately runs the server from a private
extension-storage directory (`mcpProvider.privateDir()`), and the server passes
`executable.command` straight to `spawn`, so an unanchored `./tools/bash` resolves
under that private directory and the shell never starts. Anchoring to the workspace
(or, when a cwd is configured, leaving it for the server to resolve against that cwd)
matches the documented custom-command behavior. Verified by `P51` tests in
`configFile.test.cjs` (anchoring, cwd passthrough, bare command) and
`argsBuilder.test.cjs` (validation blocks/allows).

**Commit:** 03524b0 — fix(vscode): address Codex round-7 review feedback for PR #86
