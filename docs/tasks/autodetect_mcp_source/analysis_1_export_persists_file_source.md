# Analysis 1 - Prevent export actions from persisting file-source edits

## Decision: Valid — fix applied

While the active source is `.vscode/mcp.json`, the export handlers
(`generateConfig` / `writeMcpJson` / `showCommand`) ran `applySettings` on the
posted form values and then executed the export command, which reads `wcli0.*`
settings. Because the file-source form holds the mcp.json entry (not settings),
this corrupted `wcli0.*` settings and produced output unrelated to the file being
edited. Fixed in two layers: the host export handler now refuses with an error
when `currentSource === 'mcpJson'` (defense in depth), and the webview disables
the three export buttons whenever a file source is active (re-enabling them on
the settings source, with `Write .vscode/mcp.json` still gated on a workspace
folder).

**Why:** The file-source design explicitly never writes `wcli0.*` settings (see
the `saveToFile` handler). Letting an export persist file-source diffs violated
that invariant and could silently overwrite the user's settings.

**Commit:** 81ab523 — fix(vscode): address review feedback for PR #89
