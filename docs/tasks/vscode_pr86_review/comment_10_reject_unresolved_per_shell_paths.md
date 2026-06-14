# P10 - Reject unresolved per-shell paths before managed launch

When a per-shell `allowedPaths` or `initialDir` contains an unresolved token such
as `${workspaceFolder:nope}`, the provider's managed-mode validation never
examines it and `applyPerShellOverrides` silently drops it from the generated
config. The server then launches with different path restrictions or without the
requested initial directory - potentially leaving that shell with no usable
allowed paths - instead of reporting the same blocking problem applied to global
paths. Source: `vscode-extension/src/configFile.ts:178`.
