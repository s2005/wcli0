# P78 - Strip the negated transport option from extraArgs

`stripTransportArgs` (`vscode-extension/src/argsBuilder.ts`) leaves `--no-transport` in every
forced-stdio launch. yargs interprets the negated option as `transport=false`, which fails the
server's string-choice validation, so the MCP process exits instead of starting. Handle this form
like `--no-config` is handled in `stripConfigArgs`.
