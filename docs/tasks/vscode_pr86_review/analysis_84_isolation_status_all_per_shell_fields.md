# Analysis 84 - Include every per-shell setting in the isolation status

## Decision: Valid — fix applied

`updateIsolation` in `vscode-extension/src/webview.ts` now derives the isolation status from
`collectShells()` (`Object.keys(collectShells()).length > 0`) instead of inspecting only each shell's
`enabled` and `command`. `collectShells()` builds exactly the `wcli0.shells` object the host reads,
keeping a shell only when it carries a user-set field, so the chip mirrors the host's
`hasPerShellConfig`/`isMeaningfulShellConfig` for executable args, security/restriction/path overrides
and WSL options. Input/change listeners are now wired onto every per-shell field (command, args, the
four security overrides, the three blocklist textareas, allowed paths, and the WSL mount/inherit
controls), so the chip refreshes while typing, not only on segmented-button or `configFile` changes.

**Why:** `hasPerShellConfig` (`settings.ts`) switches the provider to an isolated managed-config
launch whenever `isMeaningfulShellConfig` is true for any shell, which includes far more than
`enabled`/`command`. Deriving the chip from the same `collectShells()` the host consumes keeps the two
in lockstep, and the new listeners stop the header from misreporting `Overridable` while an override
or executable command is being edited. Verified by the `P84` tests in `webviewShells.test.cjs`
(override-only, command typing, allowed-paths-only).

**Commit:** a31e500 — fix(vscode): address Codex round-12 review feedback for PR #86
