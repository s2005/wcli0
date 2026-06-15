# P49 - Show the provider's fallback cwd with the launch command

With the default unset `launch.cwd`, the provider runs the server from a private
extension-owned directory, but `showLaunchCommand` only prints a cwd when
`spec.cwd` is explicitly configured. Copying the advertised command therefore runs
from the caller's current directory instead, where wcli0 may auto-load a different
`config.json` and use different safety settings. Resolve and display the same
fallback cwd the provider uses. Reported on
`vscode-extension/src/commands.ts:295`.
