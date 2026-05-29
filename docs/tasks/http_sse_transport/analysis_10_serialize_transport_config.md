# Analysis 10 - Include transport in serialized config

## Decision: Valid -- fix applied

`createSerializableConfig()` builds the object returned by the `get_config` tool
and the `cli://config` resource, but it only copied `global` and `shells`. The
new `transport` section added to `ServerConfig` was therefore invisible to
clients, so a server running in SSE mode or bound to a custom host/port still
reported nothing about its actual connection settings. The fix appends
`config.transport` to the serializable object (mode, sseHost, ssePort) when it is
present, so the advertised configuration reflects the live transport.

**Why:** These handlers exist to expose the complete, safe view of the server
configuration. Omitting transport contradicts that contract and hides
operationally relevant data (especially a non-default bind address). The
transport section contains no secrets, so it is safe to serialize directly. The
copy is guarded by a presence check so stdio-only configs without a transport
section serialize unchanged.

**Commit:** 0c15707 -- fix(transport): address third-round Codex review feedback for PR #83
