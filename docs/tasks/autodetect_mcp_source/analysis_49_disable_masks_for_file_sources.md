# Analysis 49 - Disable settings-only masks for file sources

## Decision: Valid — fix applied

`ignoreInheritedShells` / `ignoreInheritedProfiles` are settings-only opt-outs that no
`.vscode/mcp.json` entry can store. `applyFileTransportLock` only disables the
Shells/Profiles panels for an http/sse file source; a stdio file source left them
editable, and `applyScopeAvailability` only disabled the masks at User (Global) scope.
So a stdio file source loaded from a prior Workspace scope kept both masks editable.
Editing one passed the host's `hasRaw*Config` guard (which ignores the masks) and let
Save to file "succeed", after which the reparse dropped the edit while reporting Saved.

The fix disables both masks on ANY file source. The owner of the masks' disabled state,
`applyScopeAvailability`, now disables them when `currentSourceClient === 'mcpJson'`
(`isUser || isFile`); it runs after `applyFileTransportLock`'s blanket re-enable for the
stdio case, so the masks stay locked. As defense-in-depth (mirroring the P29/P-httpshells
dual UI+host guard), `writeMcpJsonFromSettings` also refuses a file-source save whose
settings carry a non-default mask (P-maskfile).

**Why:** The UI control is the front line, but the masks default to false and a clean
file load never sets them, so the host guard never falsely fires and makes the refusal
explicit and unit-testable (the UI lock, like the existing http/sse panel lock, runs
only in the real webview and is not exercised by the minimal test DOM).

**Proposed fix:** `applyScopeAvailability` disables the masks for a file source;
`writeMcpJsonFromSettings` adds a P-maskfile refusal.

**Commit:** 8be428b — fix(vscode): round-8 codex review follow-ups for PR #89 (file-source save round-trip)
