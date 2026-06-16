# Analysis 96 - Preserve the workspace scope while its dirty form is retained

## Decision: Valid — fix applied

Confirmed. The `onDidChangeWorkspaceFolders` listener (`vscode-extension/src/webview.ts`) forces the
host-side `currentScope` to Global when the last folder is removed, while the webview deliberately
keeps a dirty Workspace form and its Workspace radio (P89). The two then diverge: on reopen and save,
`applySettings` writes the message's Workspace target correctly, but the follow-up `post()` reads
`currentScope` (Global) and reloads Global settings over the just-saved Workspace values; the export
handlers likewise pass `currentScope` to `executeCommand`, running exports against Global.

Fix: after a successful `applySettings`, set `currentScope = msg.target` in both the `save` branch and
the export (generateConfig/writeMcpJson/showCommand) branch, before the `post()` and the
`executeCommand(command, currentScope)`. `msg.target` is the scope the form retained and that
`applySettings` just wrote, so re-aligning the host scope keeps the refresh and the export consistent
with what the form shows. The assignment runs only after a successful save, so a refused Workspace save
(no folder open, P89) does not move the scope.

**Why:** the form is the source of truth for the active scope; the host `currentScope` should track the
scope actually being saved/exported, not a transient Global value forced by folder removal. Covered by a
unit test in `webview.test.cjs` (P96) that removes and re-adds the folder, saves with a Workspace
target, and asserts the re-posted init scope is Workspace (reloading Workspace values) and that a
follow-up export command receives `'Workspace'`.

**Commit:** d83e1c4 — fix(vscode): address PR86 round-14 review (P95-P98 per-shell mask, scope, display config)
