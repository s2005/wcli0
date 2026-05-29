# P7 - Isolate active directories per SSE session

Every SSE connection now gets a fresh MCP protocol object, but the handlers
created in `createServerInstance()` (`src/index.ts:1415`) still close over the
same `CLIServer` instance. `set_current_directory` in one client mutates
`this.serverActiveCwd`, which `execute_command` reads when `workingDir` is
omitted, so concurrent SSE clients can silently run in whichever directory
another session last selected. In SSE mode the mutable active working directory
should be per-session rather than shared through the outer `CLIServer`.
