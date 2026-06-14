# Progress - VS Code extension PR #86 review

## Review Feedback (PR #86)

- [x] P1: Resolve relative paths in generated MCP entries (fixed - `pathValue` converts plain relative paths to `${workspaceFolder}` tokens when `resolvePaths` is false)
- [x] P2: Fall back when the private cwd cannot be created (fixed - `safeCwd` is set to `undefined` on mkdir failure so the provider's temp-dir fallback applies)
- [x] P2: Reject unresolved variables in custom launcher arguments (fixed - `validateLaunchSpec` now blocks unresolved `customArgs` tokens)
- [x] P2: Preserve valid fractional maxOutputLines values (fixed - `isValidMaxOutputLines` range-only check; `maxReturnLines` keeps the integer check)
- [x] P2: Refresh the provider when workspace folders change (fixed - subscribed to `onDidChangeWorkspaceFolders`)
