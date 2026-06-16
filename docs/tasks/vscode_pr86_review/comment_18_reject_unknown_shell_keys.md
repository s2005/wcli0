# P18 - Reject unknown per-shell configuration keys

When a user mistypes a shell key, for example `wcli0.shells.powerhsell.enabled: false`,
the schema accepts the arbitrary property but `hasPerShellConfig` and
`buildConfigFile` only inspect the five known shell names. The provider silently
ignores the requested configuration and can continue launching all default
shells. Restrict object keys to the supported shell names so VS Code reports the
typo instead. Source: `vscode-extension/package.json:175`.
