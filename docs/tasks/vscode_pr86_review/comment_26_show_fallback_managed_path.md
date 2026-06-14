# P26 - Show the provider's fallback managed-config path

When creation of the requested managed-config storage directory fails, activation
passes `undefined` so the provider writes the file into its private fallback
directory, but `showLaunchCommand` instead joins an empty string and displays
`managed-config.json` as a relative path. In that scenario the advertised
"resolved launch command" is not the command the provider registers, and copying
it references a nonexistent config file. Share the provider's resolved fallback
directory/path with this command. Source: `vscode-extension/src/commands.ts:219`.
