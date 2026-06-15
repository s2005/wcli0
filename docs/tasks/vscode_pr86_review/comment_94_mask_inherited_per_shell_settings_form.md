# P94 - Let workspaces mask inherited per-shell settings

When User scope defines a non-empty `wcli0.shells`, clearing all per-shell fields in Workspace produces `{}` at `vscode-extension/src/webview.ts:250`, which is converted to `undefined`; that removes the Workspace value and re-exposes the inherited User object through VS Code's object-merge, so the Workspace cannot return to the CLI-flag path. The reviewer asks for an explicit workspace-level representation that masks or disables inherited shells instead of clearing it.
