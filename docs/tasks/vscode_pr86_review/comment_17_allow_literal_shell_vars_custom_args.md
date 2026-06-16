# P17 - Allow literal shell variables in custom arguments

When a custom launch intentionally passes a shell expression such as
`customCommand: "sh"` with `customArgs: ["-c", "echo ${FOO}"]`, `isUnresolvable`
treats the ordinary shell variable as an unresolved VS Code variable and the
round-1 validation loop blocks the definition entirely. Custom arguments are
arbitrary command arguments and may legitimately contain `${...}` templates, so
validation should only reject the variable forms the extension is responsible for
resolving (`${workspaceFolder}`, `${workspaceFolder:name}`, `${userHome}`) rather
than every brace-style token. Source: `vscode-extension/src/argsBuilder.ts:360`.
