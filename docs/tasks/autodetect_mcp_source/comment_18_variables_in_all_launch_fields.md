# P18 - Allow VS Code variables in all file-source launch fields

File-source saves only exempted `settings.configFile` from local resolution. If a loaded
stdio entry used VS Code launch variables in other fields that VS Code resolves at runtime,
such as `cwd: "${env:PROJECT}"` or a node script `${input:script}`, `validateLaunchSpec`
still treated them as unresolved and rejected an otherwise no-op Save even though
`buildLaunchSpec(..., { resolvePaths: false })` would round-trip them verbatim. Apply the
same file-source variable bypass to the other mcp.json launch fields that are preserved.
File: `vscode-extension/src/commands.ts:331`.
