# P53 - Preserve current wslMountPoint on file saves

For a stdio file source, `--wslMountPoint` is parsed and re-emitted but has no form
control, so the uneditable-argv carry-forward list must also refresh it from the
current on-disk entry. If another process adds or changes `--wslMountPoint` after the
panel loaded, an unrelated Save to file rebuilds `args` from the stale loaded value
and drops that current option, despite this block's goal of preserving uneditable
argv fields.
Reference: `vscode-extension/src/commands.ts:604` (the carry-forward `buildSettings`).
