# P93 - Do not overwrite the provider config when showing scoped commands

In `vscode-extension/src/commands.ts:376`, `showLaunchCommand` calls
`provider.writeManagedConfig(settings)` with the form-scoped settings. When the configuration form is
showing User scope while a workspace has different effective settings, this writes the User-scoped
settings into the provider's single managed-config path (`managedConfigTargetDir()/managed-config.json`,
the same path `provideMcpServerDefinitions` materializes for the registered server). The registered
workspace definition still references that same path, so restarting the MCP server after clicking
"Show launch command" can launch with the wrong per-shell or safety settings until the provider
rewrites the file on a later refresh. Materialize scoped display commands in a separate file instead of
mutating the provider's active config.

Source: Codex review round 13 (pullrequestreview-4499884537), reviewed commit b583a78614.
Regression surfaced by the P73 change that reused writeManagedConfig for display.
