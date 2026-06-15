# Analysis 43 - Re-enable workspace controls when a folder is added

## Decision: Valid - fix applied

The webview's `init` handler only disabled the Workspace radio, forced Global,
disabled the `.vscode/mcp.json` button, and showed the no-workspace hint when
`hasWorkspace` was false; there was no inverse branch, so opening the view with no
folder and adding one later (round-5 P39 now re-posts on folder change) left those
controls disabled until the webview was recreated. Extracted an
`applyWorkspaceAvailability(hasWorkspace)` helper that toggles the hint, the
Workspace radio's `disabled` state, and the `writeMcp` button in both directions,
and call it on every `init`.

**Why:** The provider and form both track the primary workspace folder (round-5
P39); the form must reflect a folder being added, not just removed, or the user
is stuck on User scope with no workspace export. A single idempotent helper makes
the available/unavailable transitions symmetric and is shared with the P44 fix.

**Commit:** 11d813f - fix(vscode): address Codex round-6 review feedback for PR #86
