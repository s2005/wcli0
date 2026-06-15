# P38 - Honor the selected scope when setting configFile

When Generate Config is invoked from the form with User scope selected while a workspace is open, the generated content correctly uses User-scope settings, but choosing "Set wcli0.configFile" always writes the reference to Workspace scope solely because `folder` exists. The User setting remains unset and the reference unexpectedly affects only the current project. Use `formScopeArg` to select the update target, falling back to the current folder-based behavior only for command-palette invocations without an explicit scope.

Reference: `vscode-extension/src/commands.ts:63` — <https://github.com/s2005/wcli0/pull/86#discussion_r3410248387>
