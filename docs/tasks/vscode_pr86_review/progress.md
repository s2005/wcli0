# Progress - VS Code extension PR #86 review

## Review Feedback (PR #86)

- [x] P1: Resolve relative paths in generated MCP entries (fixed - `pathValue` converts plain relative paths to `${workspaceFolder}` tokens when `resolvePaths` is false)
- [x] P2: Fall back when the private cwd cannot be created (fixed - `safeCwd` is set to `undefined` on mkdir failure so the provider's temp-dir fallback applies)
- [x] P2: Reject unresolved variables in custom launcher arguments (fixed - `validateLaunchSpec` now blocks unresolved `customArgs` tokens)
- [x] P2: Preserve valid fractional maxOutputLines values (fixed - `isValidMaxOutputLines` range-only check; `maxReturnLines` keeps the integer check)
- [x] P2: Refresh the provider when workspace folders change (fixed - subscribed to `onDidChangeWorkspaceFolders`)

## Review Feedback (PR #86) - round 2

- [x] P6: Preserve per-shell settings in mcp.json exports (fixed - `writeWorkspaceMcpJson` refuses when `wcli0.shells` is configured)
- [x] P7: Preserve fractional maxOutputLines in generated configs (fixed - `maxOutputLinesValue` range-only check in `buildConfigFile`)
- [x] P8: Fall back after managed storage creation fails (fixed - `managedConfigDir` cleared on mkdir failure)
- [x] P9: Avoid using the shared temp directory as the server cwd (fixed - `privateDir()` creates a unique `mkdtemp` dir)
- [x] P10: Reject unresolved per-shell paths before managed launch (fixed - managed-mode per-shell path validation)
- [x] P11: Honor empty per-shell executable argument lists (fixed - `args !== undefined` guard)
- [x] P12: Treat explicit empty per-shell arrays as configured (fixed - `isMeaningfulShellConfig` uses `!== undefined`)
- [x] P13: Clear per-shell injection overrides in yolo/unsafe modes (fixed - clears `enableInjectionProtection`)
- [x] P14: Reject invalid per-shell security limits (fixed - managed-mode per-shell limit validation)
- [x] P15: Reject relative paths when no workspace can anchor them (fixed - `resolvedPath` drops them, `isUnanchorablePath` blocks)
- [x] P16: Reject unresolved log directories (fixed - blocking `logDirectory` check)
- [x] P17: Allow literal shell variables in custom arguments (fixed - `hasUnresolvedExtensionVariable` refines the round-1 check)
- [x] P18: Reject unknown per-shell configuration keys (fixed - `propertyNames.enum` in the schema)
