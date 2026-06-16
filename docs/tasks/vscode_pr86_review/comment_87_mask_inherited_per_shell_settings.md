# P87 - Let workspaces mask inherited per-shell settings

In `vscode-extension/src/webview.ts:231`, when User scope defines a non-empty `wcli0.shells`,
clearing all per-shell fields in Workspace produces `{}`, which is converted to `undefined`; that
removes the Workspace value and re-exposes the inherited User object. Because VS Code merges
object-valued settings by scope, the provider stays in managed per-shell mode and the Workspace can
never return to the CLI-flag path. Preserve an explicit workspace-level representation that masks or
disables inherited shells instead of clearing it.
