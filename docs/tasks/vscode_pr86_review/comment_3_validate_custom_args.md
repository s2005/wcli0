# P2 - Reject unresolved variables in custom launcher arguments

When the custom launch method uses an argument such as
`${workspaceFolder}/server.js` and no workspace folder is open,
`resolveVariables` leaves the token literal, but `validateLaunchSpec` only
validates `customCommand`, not `customArgs`. The provider then registers a
definition that repeatedly fails or passes an unintended literal argument
instead of reporting the misconfiguration. Validate non-empty custom arguments
that still contain unresolved variable tokens before launching. Source:
`vscode-extension/src/argsBuilder.ts:261`.
