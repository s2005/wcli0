# Analysis 7 - Isolate active directories per SSE session

## Decision: Valid -- fix applied

Each SSE connection already received its own MCP `Server`, but every handler
closed over the same `CLIServer` and read/wrote the single
`this.serverActiveCwd` field. `set_current_directory` in one client therefore
changed the directory that `execute_command` (with no `workingDir`) used for
every other concurrent SSE client. The fix introduces a `SessionState`
(`{ activeCwd }`) object: `createServerInstance(session)` and
`setupHandlers(server, session)` now thread a per-instance state through, the
`CallToolRequestSchema` handler passes it to `_executeTool(params, session)`, and
the `execute_command` / `get_current_directory` / `set_current_directory` cases
read and write `session.activeCwd` instead of the shared field. `run()` seeds
each SSE connection with a fresh `SessionState` copied from the primary session's
initial cwd. `serverActiveCwd` is kept as a getter/setter that proxies to a
`primarySession` object, so stdio mode, `initializeWorkingDirectory()`, and the
many tests that read or assign `serverActiveCwd` are unchanged. New unit tests
prove two sessions keep independent directories while the primary session stays
untouched.

**Why:** A per-session state object is the minimal change that isolates the
mutable cwd without duplicating handler logic or altering the public
`_executeTool` contract (the `session` parameter defaults to the primary
session). `process.chdir()` remains a process-global call, but command execution
always spawns with an explicit cwd resolved from `session.activeCwd`, so routing
is now correctly per-session -- which is exactly the leak the reviewer flagged.
The getter/setter shim preserves backward compatibility with existing tests that
treat `serverActiveCwd` as a field.

**Commit:** 3365e3f -- fix(transport): address second-round Codex review feedback for PR #83
