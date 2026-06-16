# P84 - Include every per-shell setting in the isolation status

The header isolation status (`updateIsolation` in `vscode-extension/src/webview.ts:947`) only
examines each shell's `enabled` and executable `command`, but `collectShells()` (and the host's
`hasPerShellConfig`) also treats executable args, security/restriction/path overrides and WSL options
as per-shell configuration that switches the provider to an isolated managed-config launch. The chip
therefore reports `Overridable` when only those fields are set, and it does not refresh while typing
because only the segmented enable buttons and `configFile` have isolation listeners.
