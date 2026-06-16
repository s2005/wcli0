# Analysis 93 - Do not overwrite the provider config when showing scoped commands

## Decision: Valid — stashed, not implemented

Confirmed against the code. `showLaunchCommand` (`vscode-extension/src/commands.ts:376`) calls
`provider.writeManagedConfig(settings)` with the form-scoped settings (`readExportSettings(asScope(
formScopeArg), scope)` at line 356). `writeManagedConfig` (`mcpProvider.ts:186-205`) writes to
`managedConfigTargetDir()/MANAGED_CONFIG_FILE` — the **same single path** that the live provider
materializes for the registered server in `provideMcpServerDefinitions` (`mcpProvider.ts:268`, same
`writeManagedConfig` call). There is no separate display target.

Consequently, when the form shows User scope but the workspace's effective settings differ, clicking
"Show launch command" rewrites the provider's active managed config in place with the User-scoped
contents. The registered server definition still references that path, so a subsequent server
(re)start loads the wrong per-shell / safety settings until the next provider refresh rewrites the file
from the effective workspace settings. This is a real correctness regression.

Root cause: P73 ([[analysis-73-materialize-managed-config-before-show]]) deliberately reused
`writeManagedConfig` so the displayed `--config <path>` pointed at a file that actually exists and
matched the shown settings. That fixed the "stale/missing display file" problem but coupled the display
action to the provider's live config path, trading it for this "display mutates the running server's
config" problem.

**Proposed fix (not applied):** materialize the displayed command's config into a **separate** file
that is never the provider's active managed-config path — e.g. add a `writeDisplayConfig(settings)`
(or a `target`/`purpose` parameter on `writeManagedConfig`) that writes to a distinct filename (or a
display-only subdirectory) under the same private dir, returns that path, and is used only by
`showLaunchCommand`. Keep the P73 guarantee (the shown path exists and matches the shown settings)
while leaving `MANAGED_CONFIG_FILE` owned solely by `provideMcpServerDefinitions`. Update the
`P26/P73` test in `commands.test.cjs` to assert the display write targets a different path than the
provider's registered config.

**Status:** implemented. Added `writeDisplayConfig` (writing `MANAGED_DISPLAY_CONFIG_FILE =
display-config.json`) and switched `showLaunchCommand` to it; `MANAGED_CONFIG_FILE` stays owned by
`provideMcpServerDefinitions`. The `P26/P73/P93` test asserts the display write targets a different
path and leaves the live managed config untouched. See [[comment_93_isolate_scoped_display_config]].
