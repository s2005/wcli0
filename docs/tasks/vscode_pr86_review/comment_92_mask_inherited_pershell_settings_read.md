# P92 - Allow workspaces to mask inherited per-shell settings

In `vscode-extension/src/settings.ts:157`, `wcli0.shells` is read with `g<ShellsConfig>('shells', {})`.
Because VS Code deep-merges object-valued settings, reading `wcli0.shells` this way means a Workspace
value cannot remove fields inherited from the User value. For example, if User scope configures a
custom `cmd` executable, clearing that shell in the Workspace form removes the workspace override and
the custom executable remains effective, while the workspace-scoped form shows no configuration. This
prevents projects from reverting inherited per-shell executables or security overrides despite the
documented Workspace-overrides-User behavior.

Source: Codex review round 13 (pullrequestreview-4499884537), reviewed commit b583a78614.
Re-raise of P87 at the read site (settings.ts) rather than the form (webview.ts:249).
