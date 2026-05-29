# Analysis 6 - Track sockets instead of relying on closeAllConnections

## Decision: Valid -- fix applied

`closeSseServer()` forced lingering sockets closed only through
`server.closeAllConnections()`, which Node added in 18.2. The package's
`engines.node` is `>=18.0.0`, so on 18.0/18.1 the method is `undefined` and the
old guard (`typeof closeAll === 'function'`) silently skipped it. With an active
long-lived `/sse` stream, `server.close()` then waited for the client to
disconnect on its own, so `cleanup()`/SIGINT could hang indefinitely. The fix
tracks every accepted socket in a per-server `Set` (populated from the
`connection` event and pruned on each socket's `close`), keyed weakly by server
in a module-level `WeakMap`. `closeSseServer()` still prefers
`closeAllConnections()` when present, but now falls back to destroying the
tracked sockets, guaranteeing close completes on every supported runtime. A new
test stubs `closeAllConnections` to `undefined`, opens a live SSE stream, and
asserts `closeSseServer()` still tears the server down.

**Why:** Tracking sockets removes the version dependency entirely instead of
masking it, and is preferable to raising the minimum Node version because it
keeps the advertised `>=18.0.0` support contract intact. The `WeakMap` keying
avoids leaking server references and needs no changes to the `closeSseServer`
signature, which several tests and `cleanup()` already depend on.

**Commit:** 3365e3f -- fix(transport): address second-round Codex review feedback for PR #83
