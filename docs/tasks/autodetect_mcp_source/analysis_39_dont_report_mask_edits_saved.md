# Analysis 39 - Don't report inherited-mask edits as saved to mcp.json

## Decision: Valid — fix applied (jointly with P36)

The `ignoreInheritedShells` / `ignoreInheritedProfiles` masks are scope-merge
affordances with no representation in an mcp.json `servers.wcli0` entry, and
`parseMcpEntry` never reads them back. Letting them be edited on a file source
(Codex's point) is the same hole that lets them bypass the P29 refusal (P36):
both are closed by making a file source unable to set them. The mask selects are
now disabled while `currentSourceClient === 'mcpJson'` (re-enabled when the form
returns to the settings source), so a file save can neither carry a mask edit
nor use one to suppress `hasPerShellConfig`/`hasProfilesConfig`.

**Why:** A file source has no scope to inherit from, so the masks are
meaningless there; disabling them matches the existing pattern of disabling
controls that do not apply to the active source (the export buttons, P1) and
removes both the misleading-saved-state and the P29-bypass symptoms at once.

**Proposed fix:** `setActiveSource` disables/enables both mask selects with the
source; the P29 raw-check defense (P36) covers any non-UI path. Covers
[[comment_39_dont_report_mask_edits_saved]] and
[[comment_36_p29_bypass_ignore_mask]].
**Resolution:** Same fix as [[analysis_36_p29_bypass_ignore_mask]] — the
`hasRaw*` refusal blocks a file-source save carrying shells/profiles regardless of
the mask, so a mask edit can no longer be misreported as saved.

**Commit:** ceefe56 — fix(vscode): round-6 codex review follow-ups for PR #89 (parser + save round-trip)
