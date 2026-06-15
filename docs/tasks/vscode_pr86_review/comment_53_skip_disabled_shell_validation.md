# P53 - Skip validation for shells that are effectively disabled

When a shell is disabled explicitly or by the legacy single-shell selector, the
managed validation loop still validates its unresolved paths, invalid limits, and
executable variables and blocks the entire MCP provider. A disabled shell is never
spawned and the generated config safely preserves its disabled state, so stale
machine-specific settings on that shell should not prevent the enabled shells from
registering.

File: `vscode-extension/src/argsBuilder.ts:560`
