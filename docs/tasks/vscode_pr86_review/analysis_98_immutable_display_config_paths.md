# Analysis 98 - Give displayed managed commands immutable config paths

## Decision: Valid — fix applied

Confirmed follow-up to P93 ([[analysis_93_isolate_scoped_display_config]]). P93 added
`writeDisplayConfig` writing to a single fixed `display-config.json`. Because every managed
`showLaunchCommand` reuses that one path, showing a command for a second scope/settings state
overwrites the file the first shown (and copied) command references — so running the previously copied
command no longer launches the configuration that was displayed.

Fix: derive the display file name from a hash of the config content
(`display-config-<sha256-16>.json`) in `writeDisplayConfig` (`vscode-extension/src/mcpProvider.ts`).
Distinct content (a different scope or changed settings) writes a distinct file, so a previously shown
command keeps resolving exactly what it displayed; identical content reuses the same file (no
unbounded churn for repeated identical shows). `writeConfigTo` was split into a thin
`writeConfigContent(fileName, content, label)` helper so `writeDisplayConfig` can choose a
content-derived name while reusing the same private-directory fallbacks; `writeManagedConfig` keeps its
fixed `managed-config.json` path (owned solely by `provideMcpServerDefinitions`, the P93 invariant).
The exported `MANAGED_DISPLAY_CONFIG_FILE` constant became `MANAGED_DISPLAY_CONFIG_PREFIX`.

**Why:** "remain runnable as shown" requires that a displayed config never be mutated in place by a
later, different invocation. A content hash satisfies that for any scope/settings combination (stronger
than a per-scope filename, which would still overwrite on a settings change within the same scope).
Display configs live in the private managed dir and are tiny, so retaining a few distinct ones is
acceptable. Covered by an updated `P26/P73/P93` test (asserts the content-specific name and that the
live managed config is untouched) and a new `P98` test (different settings → distinct files, the first
file is left intact, identical settings → the same file).

**Commit:** d83e1c4 — fix(vscode): address PR86 round-14 review (P95-P98 per-shell mask, scope, display config)
