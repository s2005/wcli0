# P52 - Resolve relative Node scripts against the configured cwd

When `wcli0.launch.cwd` is configured and `nodeScriptPath` is relative, `pathValue`
still anchors the script to the workspace root. For example, with cwd `/repo/server`
and script `dist/index.js`, this launches `/repo/dist/index.js` instead of the path
Node would resolve under the configured cwd, `/repo/server/dist/index.js`. Preserve
the relative script when a cwd is set or resolve it against that cwd.

File: `vscode-extension/src/argsBuilder.ts:371`
