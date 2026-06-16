# P15 - Reject relative paths when no workspace can anchor them

When a user-scoped path such as `allowedDirectories: ["src"]` is active with no
workspace folder open, `resolvedPath` returns the relative value unchanged
because there is no base to resolve against. The provider still registers the
server, and the server's `normalizeWindowsPath` converts the allowed directory to
`C:\src`, potentially allowing an unrelated root-level directory instead of
refusing the ambiguous configuration. Source: `vscode-extension/src/argsBuilder.ts:41`.
