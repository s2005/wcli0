# P100 - Preserve unsupported shell names

In `vscode-extension/src/configSource.ts:540`, every shell name outside the form's fixed choices is
unrepresentable, not only the explicit `all` case: `--shell fish` is modeled into `settings.shell`,
but assigning `fish` to the `<select>` leaves it with the empty/Inherit value, the form is
immediately considered changed, and a no-op Save drops `--shell`. The server previously disabled
every known shell because none matched `fish`, whereas the rewritten entry restores the default
enabled shells, so every value not offered by the shell select must be diverted rather than only
`all`.
