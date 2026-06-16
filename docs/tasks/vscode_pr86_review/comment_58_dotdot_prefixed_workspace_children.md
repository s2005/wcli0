# P58 - Preserve portability for dot-dot-prefixed workspace children

A target inside the workspace whose first relative component merely starts with two
dots, such as `/workspace/..generated/wcli0.json`, is incorrectly classified as
outside because `rel.startsWith('..')` also matches ordinary names like `..generated`.
Choosing that valid in-workspace location stores an absolute `wcli0.configFile` path
instead of a `${workspaceFolder}` path, so the committed workspace setting breaks on
teammates' machines. Check for an actual parent traversal component (`rel === '..'` or
`rel.startsWith('../')`) instead.

File: `vscode-extension/src/commands.ts:445`
