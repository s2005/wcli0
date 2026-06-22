# P39 - Don't report inherited-mask edits as saved to mcp.json

When editing a stdio `.vscode/mcp.json` source, the `ignoreInheritedShells` and
`ignoreInheritedProfiles` controls can be changed, but those booleans are
settings-only and are not emitted into any mcp.json entry. The file-source save
guard only rejects raw `shells`/`profiles`, so changing just one of the
inherited-mask toggles lets Save succeed; the post-save reparse then drops the
change (it is not read back) and shows the user a misleading "saved" state while
nothing about those masks was persisted. Treat these masks as unsavable for a
file source (refuse or disable them there). This is the same root issue as
[[comment_36_p29_bypass_ignore_mask]] (Codex independently flagged it).
Reference: `vscode-extension/src/commands.ts:445` (the file-source save guards).
