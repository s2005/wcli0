# P80 - Preserve concurrent changes to unchanged modeled arguments

In `vscode-extension/src/commands.ts:677` (`writeMcpJsonFromSettings`), a file-source save re-derives
only the uneditable argv fields from the current on-disk entry and spreads the stale form-derived
`settings` for everything else, so when `.vscode/mcp.json` changes after the panel loads -- another
editor changing `--shell cmd` to `--shell bash` while the user changes only Debug -- `buildLaunchSpec`
replaces the entire `args` array and silently restores the old shell. Unchanged modeled fields must be
based on the current parsed entry (overlaying only the submitted form changes), or the stale save must
be rejected.
