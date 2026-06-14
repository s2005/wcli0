# P30 - Resolve relative node script paths before launch

When `launch.method` is `node` and `nodeScriptPath` is relative (e.g. `dist/index.js`), validation
accepts it and `buildLaunchSpec` passes the relative value to Node unchanged
(vscode-extension/src/argsBuilder.ts:283). The automatic provider runs from a private extension
directory when `launch.cwd` is unset, so the relative path resolves under that private directory
rather than the open workspace and the server fails to start. Resolve relative node script paths
against the workspace (rejecting them when no workspace can anchor them), like other path settings.
