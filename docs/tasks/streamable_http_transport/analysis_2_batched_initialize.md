# Analysis 2 - Accept single-message batched initialize requests

## Decision: Valid — fix applied

Replaced the bare `isInitializeRequest(body)` guard on the new-session branch
with a helper that also recognizes a single-message JSON-RPC batch
(`[{...initialize...}]`). A batched initialize now routes into session creation
and is handed to the SDK transport, which already parses array bodies.

**Why:** The wrapped `StreamableHTTPServerTransport` parses array bodies and
detects initialize via `messages.some(isInitializeRequest)`, so it natively
accepts a single-message batch; the wrapper rejecting it with a 400 made the
endpoint strictly less compatible than the transport it fronts. The helper is
scoped to single-element arrays: the SDK rejects multi-message batches that
contain an initialize ("Only one initialization request is allowed"), and
limiting to length 1 keeps a malformed multi-message batch on the existing
400 path instead of constructing a per-session server the SDK would then reject
(avoiding a transient server-instance leak). Non-array and non-initialize
bodies are unaffected.

**Commit:** 6faafac — fix(transport): address review feedback for PR #84
