# Worker Exit Warning - Investigation

## Context

After the SIGINT handler leak was fixed (commit `efa1d4c`), `npm test` still printed:

```text
A worker process has failed to exit gracefully and has been force exited.
This is likely caused by tests leaking due to improper teardown. Try running
with --detectOpenHandles to find leaks. Active timers can also cause this,
ensure that .unref() was called on them.
```

The original commit message attributed this to "other test files" (LogStorageManager
timers or Windows shell child processes). This document records the actual root cause
and the fix.

## Summary of findings

- The warning is NOT produced by the shell-execution or LogStorageManager tests.
- It is produced by `tests/integration/sse-transport.test.ts`, and specifically by its
  one test that starts the server in stdio mode.
- Root cause: starting the stdio transport leaves `process.stdin` in flowing (referenced)
  mode, which keeps the worker process alive. `CLIServer.cleanup()` did not close the MCP
  transport, so stdin was never released.
- Fix: `CLIServer.cleanup()` now closes the MCP server transport and pauses `process.stdin`.
  The warning is gone in normal parallel execution and all tests pass.

## Root cause

`StdioServerTransport.start()` (MCP SDK) attaches a `data` listener to `process.stdin`:

```js
this._stdin.on("data", this._ondata);
```

Adding a `data` listener puts `process.stdin` into flowing mode, which references the
stdin handle and keeps the Node process (the Jest worker) alive.

The test `should use stdio mode when transport is stdio` calls `cliServer.run()`, which
in stdio mode does `new StdioServerTransport()` + `server.connect(transport)` and starts
reading stdin. `CLIServer.cleanup()` (run in `afterEach`) removed the SIGINT handler and
closed the HTTP server, but never closed the MCP server, so the stdin `data` listener was
left attached. Even calling `transport.close()` is not enough on its own:
`StdioServerTransport.close()` only removes the `data` listener; it does not take stdin
out of flowing mode, so the handle stays referenced.

Only `sse-transport.test.ts` exercises stdio mode, which is why only that file triggered
the warning.

Why `--detectOpenHandles` looked clean: Jest's open-handle detector ignores the standard
streams (`stdin`/`stdout`/`stderr`), so a referenced `process.stdin` is never reported.

## Evidence

### Bisection (parallel worker mode)

| Test group | Worker warning |
| ---------- | -------------- |
| Full suite | yes |
| All non-subdirectory tests | no |
| Spawn-heavy shell/timeout/process tests | no |
| `tests/wsl/**` | no |
| `tests/integration/**` minus the three `sse-*` files | no |
| `sse-transport.test.ts` alone (paired with a trivial file) | yes |
| `sse-security.test.ts` alone (paired with a trivial file) | no |
| `sse-tool-execution.test.ts` alone (paired with a trivial file) | no |

`sse-security` and `sse-tool-execution` only use the SSE client helper; `sse-transport` is
the only one that starts a stdio-mode server.

### Handle snapshot at worker exit

Instrumenting the worker (`process._getActiveHandles()`) immediately after the file's
tests complete showed, among the standard worker pipes:

```text
Socket fd=0 reading=true   <- process.stdin, still in flowing mode
```

Polling `process.getActiveResourcesInfo()` into the worker's exit window showed only the
standard `PipeWrap` stream handles remained - no leaked sockets, servers, timers, or
requests. The referenced stdin stream was what kept the worker from exiting before Jest's
500 ms force-exit deadline (`FORCE_EXIT_DELAY` in `jest-worker`).

### Confirmation

Adding `process.stdin.pause()` to `CLIServer.cleanup()` removed the warning in parallel
worker mode immediately and deterministically.

## Fix

`src/index.ts` - `CLIServer.cleanup()`:

- `await this.server.close()` - disconnects the MCP transport (stdio or SSE).
- `process.stdin.pause()` for non-SSE modes - takes stdin out of flowing mode so the
  handle is released and the event loop can drain.

`src/utils/transport.ts` - `closeSseServer()` was also hardened to call
`server.closeAllConnections()`. `http.Server.close()` only stops accepting new
connections and waits for existing ones to end; long-lived SSE streams would otherwise
keep a SIGINT shutdown from completing. This is an independent production-shutdown
improvement.

### Verified outcome

`npm test` (normal parallel execution, no `--runInBand`, no `forceExit`):

- 0 worker warnings, exit code 0.
- 900 passed, 24 skipped, 0 failed (3 consecutive runs).
- Run time ~17 s (full parallelism preserved).

## Approaches that were rejected

| Approach | Result |
| -------- | ------ |
| `forceExit: true` | Only force-exits the main process; the worker warning (emitted earlier by `jest-worker`) is unaffected. |
| `maxWorkers: 1` / `--runInBand` | Removes the warning but only by disabling parallelism (~35 s vs ~17 s). A workaround, not a fix. |
| `workerThreads: true` | Removes the warning but breaks `process.chdir()` (unsupported in worker threads), failing the `set_current_directory` test. |
| `server.closeAllConnections()` alone | Good for SSE shutdown, but did not address the stdin handle. |
| Static import of the transport module, `setImmediate` yields, 100 ms per-test delays | No effect. |

## How to re-verify

```bash
# Should be clean (no warning), full parallel run
node --experimental-vm-modules node_modules/jest/bin/jest.js

# The previously-offending file on its own
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/integration/sse-transport
```
