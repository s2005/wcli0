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
timers or Windows shell child processes). This document records the actual root cause,
the evidence gathered, and what does and does not remove the warning.

## Summary of findings

- The warning is NOT produced by the shell-execution or LogStorageManager tests.
- It is produced by `tests/integration/sse-transport.test.ts` (the HTTP/SSE tests).
- There is NO real resource leak. `jest --detectOpenHandles` reports zero open handles.
- It is a known interaction between Jest worker processes and Node's
  `--experimental-vm-modules` ESM loader, triggered by the volume of HTTP server and
  socket churn in that single file.

## Root cause

At the moment a Jest worker finishes `sse-transport.test.ts` and is asked to exit, the
worker still holds transient handles from the just-closed HTTP/SSE servers:

- 2 `Server` handles with `listening=false` and `connections=0` (already closed).
- 6 `Socket` handles with `destroyed=true` (already destroyed) but still listed as
  active by `process._getActiveHandles()`.

These handles are reaped by libuv within roughly 50 ms. The worker, however, is
force-exited by `jest-worker` before that happens, which prints the warning. Under
`--experimental-vm-modules` the worker does not self-terminate even after the handles
are gone, because the VM module context keeps a reference the event loop cannot drain.

## Evidence

### Bisection (parallel worker mode)

| Test group | Worker warning |
| ---------- | -------------- |
| Full suite | yes |
| All non-subdirectory tests | no |
| Spawn-heavy shell/timeout/process tests | no |
| `tests/wsl/**` | no |
| `tests/integration/**` | yes |
| `tests/integration/**` minus the three `sse-*` files | no |
| `sse-transport.test.ts` alone (paired with a trivial file) | yes |
| `sse-security.test.ts` alone (paired with a trivial file) | no |
| `sse-tool-execution.test.ts` alone (paired with a trivial file) | no |
| Each `sse-transport.test.ts` describe block run on its own | no |

Conclusion: only `sse-transport.test.ts` triggers it, and only when its three describe
blocks run together (a cumulative, not per-test, effect).

### Open handle analysis

`jest --detectOpenHandles` (which implies `--runInBand`) reports zero open handles for
the SSE tests, both for the full suite and for the SSE files in isolation. There is no
permanently leaked timer, socket, or child process.

Note: `--detectOpenHandles` is also unreliable under `--experimental-vm-modules`, so a
direct handle snapshot was taken inside the worker to confirm the above.

### Handle snapshot at worker exit

Instrumenting the worker (`process._getActiveHandles()`) immediately after the file's
tests complete shows, for `sse-transport.test.ts`:

```text
Server listening=false connections=0          (x2)
Socket destroyed=true reading=true fd=undefined (x6, mix of client and server side)
+ the standard worker stdio pipes and IPC channel
```

All application handles are already closed/destroyed; they clear on their own within
~50 ms.

## What does NOT remove the warning

The following were each tried and verified to NOT remove the worker warning:

- `forceExit: true` in the Jest config. It only force-exits the main process at the end
  of the run; the worker warning is emitted earlier by `jest-worker` and is unaffected.
- `server.closeAllConnections()` in `closeSseServer()` (see below). It makes the
  isolated `SseTestClient` flow clean but does not fix the full `sse-transport.test.ts`
  file.
- Converting the dynamic `import('./utils/transport.js')` in `CLIServer` to a static
  import.
- Yielding the event loop (`setImmediate`) in `SseTestClient.close()`.
- A 100 ms delay after every test.

The only thing that removes it is running the tests serially (no worker child
processes): `jest --runInBand` (or `maxWorkers: 1`) produces a fully clean run
(exit 0, 0 warnings, all tests pass) in ~35 s versus ~20 s in parallel.

## Related production-correctness fix

Independently of the test warning, `closeSseServer()` in `src/utils/transport.ts` was
improved to call `server.closeAllConnections()`. `http.Server.close()` only stops
accepting new connections and waits for existing ones to end on their own; long-lived
SSE streams would otherwise keep the server (and a SIGINT shutdown) from completing.
This is a real improvement for production shutdown and is kept regardless of the test
strategy chosen for the warning.

## How to re-verify

```bash
# Reproduce the warning (parallel workers)
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/integration/sse-transport

# Confirm no real leak (serial + handle detection)
npm run test:debug -- tests/integration/sse-transport

# Confirm a clean serial run
node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand
```
