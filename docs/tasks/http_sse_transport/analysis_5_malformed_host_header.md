# Analysis 5 - Handle malformed Host headers

## Decision: Valid -- fix applied

The HTTP request callback built the request URL from `req.url` and
`req.headers.host` via `new URL()` as its very first statement. A client can
send an unparseable `Host` (for example `%%%%`), which
makes `new URL()` throw `ERR_INVALID_URL`. Because the callback is `async`, the
throw escaped as an unhandled promise rejection, and under Node's default
`--unhandled-rejections=throw` policy that terminates the process -- so a single
unauthenticated request could take the SSE server down. The fix wraps the URL
construction in a `try/catch` that returns a 400 `Bad Request` (and falls back to
`localhost` as the base host when the header is absent), keeping the listener
alive. A new integration test sends `Host: %%%%`, asserts the 400, and then
confirms a subsequent normal request still succeeds (the process did not crash).

**Why:** Returning 400 is the correct semantic for a malformed request line and
is strictly safer than letting the exception propagate. Parsing defensively at
the single entry point covers every route at once, and validating before the
origin check keeps the crash surface minimal. The behavior matches the existing
defensive style already used for malformed Origin headers.

**Commit:** 3365e3f -- fix(transport): address second-round Codex review feedback for PR #83
