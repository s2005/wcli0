# P27 - Preserve cwd-relative --config when saving file sources

When editing an existing stdio `.vscode/mcp.json` entry that has a non-workspace `cwd`
and a relative `--config` argument, an otherwise unrelated Save regenerates `args` and
the merge replaces the original argv. `buildLaunchSpec(..., { resolvePaths: false })`
rewrites `--config config.json` to `${workspaceFolder}/config.json`, but the original
server process would resolve `config.json` under its `cwd` (for example
`${workspaceFolder}/server/config.json`). The saved entry then launches with a different
config file than the one that was loaded, which can change shells or safety settings
unexpectedly. The `resolvePaths: false` workspace-anchoring in `pathValue` must not apply
to relative path args when the entry carries an explicit `cwd`.
File: `vscode-extension/src/commands.ts:524`, `vscode-extension/src/argsBuilder.ts:285`.
