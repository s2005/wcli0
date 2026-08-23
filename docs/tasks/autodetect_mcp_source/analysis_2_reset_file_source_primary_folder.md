# Analysis 2 - Reset file source when the primary folder changes

## Decision: Valid — fix applied

The `onDidChangeWorkspaceFolders` handler only reset the file source when no
folders remained. In a multi-root workspace, removing/reordering folders could
change `primaryWorkspaceFolder()` to a different folder while keeping
`currentSource === 'mcpJson'` and `loadedFileSettings` from the old folder; the
next `saveToFile` would then overwrite the new primary folder's
`.vscode/mcp.json` with the previous folder's config. Fixed by tracking the
fsPath of the folder the file source was loaded from (`loadedFileFolder`, set on
load and on save, cleared on switching to settings) and resetting the file source
in the folders-change handler whenever the current primary folder's fsPath no
longer matches it — which also subsumes the previous no-folder case.

**Why:** A file source is workspace-relative and bound to one folder. Saving it
against a different folder is data loss; resetting to the settings source is the
safe, predictable fallback.

**Commit:** 81ab523 — fix(vscode): address review feedback for PR #89
