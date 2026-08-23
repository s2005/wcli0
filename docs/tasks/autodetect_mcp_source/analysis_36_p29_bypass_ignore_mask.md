# Analysis 36 - The ignore-inherited masks bypass the P29 refusal and silently drop shells/profiles on a file save

## Decision: Valid — fix applied

`applyScopeAvailability` disables the `ignoreInheritedShells` /
`ignoreInheritedProfiles` selects only when `scope === 'Global'`; `setActiveSource`
never disables them for a file source. So at the retained Workspace scope (the
scope radio is hidden but `currentScope`/`formScope` stays Workspace) the user
can set either mask to Ignore. The P29 gate calls
`hasPerShellConfig(settings)` / `hasProfilesConfig(settings)`, and both return
`false` when their mask is set (settings.ts:328, :393). The masks exist to let a
Workspace scope opt out of User-scope shells/profiles — a concept with no meaning
for a scope-less file source, where `parseMcpEntry` starts from `defaultSettings()`
and never reads shells/profiles back. So enabling a mask on a file source both
silently drops the mask itself (no entry field for it) and defeats the P29
refusal, letting the user's per-shell/profile edits be silently dropped on a save
that reports success. The existing P29 tests (commands.test.cjs:855,880) cover
only the no-mask case.

**Why:** P29 must catch every file-source save that carries shells/profiles the
entry cannot persist. Routing it through the mask-aware `hasPerShellConfig`/
`hasProfilesConfig` re-opens the hole, and leaving the mask controls editable on
a file source invites the bypass.

**Proposed fix:** Disable both mask selects when `currentSourceClient ===
'mcpJson'` (add to `setActiveSource`), AND/OR evaluate the P29 condition on the
raw `settings.shells`/`settings.profiles` (ignoring the masks) for a file
source, so the refusal cannot be bypassed. Pair with
[[analysis_35_p29_gate_missing_http_sse]].
**Resolution:** Implemented in PR #89 round 6 via the raw-check approach: the
hoisted refusal calls `hasRawPerShellConfig` / `hasRawProfilesConfig` (new in
settings.ts), which ignore the `ignoreInheritedShells/Profiles` masks, so enabling
a mask can no longer suppress the refusal. Covers [[analysis_39_dont_report_mask_edits_saved]].

**Commit:** ceefe56 — fix(vscode): round-6 codex review follow-ups for PR #89 (parser + save round-trip)
