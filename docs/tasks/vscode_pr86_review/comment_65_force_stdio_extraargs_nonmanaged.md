# P65 - Force stdio despite transport values in extra arguments

When `transport.mode` is `stdio` and no config file is referenced, `emittedTransport` stays false,
so an `extraArgs` value such as `['--transport', 'http']` is appended unchanged. The provider still
registers an `McpStdioServerDefinition`, while the server applies the extra transport option and
starts an HTTP listener instead of speaking over stdio, leaving the registered MCP server unable to
connect. Provider-built stdio launches must strip or override transport arguments in this case too.

File: `vscode-extension/src/argsBuilder.ts:334` (buildServerArgs, stdio branch)
