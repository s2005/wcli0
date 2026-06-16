# Analysis 90 - Correct the documented default working directory

## Decision: Valid — fix applied

The `wcli0.launch.cwd` `markdownDescription` in `vscode-extension/package.json` no longer claims the
default is "the first workspace folder". It now states that when unset, the extension launches from a
private extension-owned directory (not the workspace folder), so the server does not auto-load an
implicit workspace `config.json`.

**Why:** when `wcli0.launch.cwd` is unset the provider deliberately uses extension-owned storage or a
unique temporary directory (`mcpProvider.ts:277-293`), specifically to avoid the server discovering a
`<workspace>/config.json` that could silently override safe settings. The old description misled users
who expected workspace-relative process behavior or implicit workspace-config loading. Documentation
only; no code change.

**Commit:** df1378b — fix(vscode): address Codex round-12 review feedback for PR #86
