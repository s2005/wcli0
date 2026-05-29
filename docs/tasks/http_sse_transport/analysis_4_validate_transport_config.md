# Analysis 4 - Validate transport config before use

## Decision: Valid -- fix applied

`validateConfig()` checked security, shells, timeout, and logging but never the
`transport` section, so file-supplied values flowed straight into `run()`. A
string `ssePort` (for example `"3000"`) silently becomes a named-pipe path in
`httpServer.listen()` while startup still logs `http://host:3000`, breaking SSE
clients with no error. The fix adds `validateTransportConfig()` and calls it from
`validateConfig()`: `mode` must be `stdio` or `sse`, `sseHost` must be a
non-empty string, and `ssePort` must be an integer in `1..65535`. Because
`loadConfig()` runs `validateConfig()` after the merge, a malformed config now
fails fast at startup.

**Why:** The CLI path already validated these values in `applyCliTransport()`, so
config-file values were the only unguarded entry point -- exactly the gap the
reviewer flagged. Reusing the existing `validateConfig()` chokepoint keeps the
validation in one place and catches typos before the listener is created. The
port range mirrors the `1..65535` bound already enforced for `--sse-port`.

**Commit:** 57358aa -- fix(transport): address Codex review feedback for PR #83
