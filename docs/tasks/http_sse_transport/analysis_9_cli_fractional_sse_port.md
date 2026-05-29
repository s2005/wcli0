# Analysis 9 - Reject fractional SSE ports from the CLI

## Decision: Valid -- fix applied

`validateTransportConfig()` rejects non-integer ports, but it only runs inside
`validateConfig()` during `loadConfig()` -- which executes before
`applyCliTransport()` in `index.ts`. The CLI override path had its own guard
(`ssePort > 0 && ssePort <= 65535`) that omitted an integer check, so
`--transport sse --sse-port 9444.5` passed and was assigned. Node's
`httpServer.listen()` then throws `ERR_SOCKET_BAD_PORT` for a fractional port,
crashing startup instead of warning and falling back to the default. The fix
adds `Number.isInteger(ssePort)` to the guard in `applyCliTransport()` so a
fractional port is rejected and ignored with the existing warning, leaving the
default port in place.

**Why:** The reviewer correctly identified that yargs `number` options accept
decimals and that CLI overrides bypass the centralized validation. Mirroring the
`Number.isInteger` rule already enforced in `validateTransportConfig()` keeps the
two entry points consistent and converts a hard crash into the same
warn-and-ignore behavior used for out-of-range ports.

**Commit:** 0c15707 -- fix(transport): address third-round Codex review feedback for PR #83
