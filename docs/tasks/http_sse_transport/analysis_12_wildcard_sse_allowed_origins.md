# Analysis 12 - Add an allowed-origins configuration for wildcard binds

## Decision: Valid -- fix applied

On a wildcard bind (`--sse-host 0.0.0.0` / `::`) the bind host is not a usable
origin to compare against, so `isOriginAllowed` rejected every real browser
client reaching the server through its LAN address or a reverse proxy whose
public hostname differs from the bind host. The fix introduces an explicit
allowed-origin list: a new optional `transport.sseAllowedOrigins: string[]`
config field and a `--sse-allowed-origins` CLI flag (comma-separated, parsed by
`applyCliTransport`). `isOriginAllowed` now also accepts any origin whose host
matches an entry in that list, in addition to loopback and the bind host;
entries may be full origin URLs or bare hosts, and only the host component is
compared (case-insensitively, matching the existing bind-host comparison).
`validateTransportConfig` rejects a non-array value or empty-string entries, the
list defaults to empty, and `createSseServer`/`run()` thread it through to the
request handler. README and config examples document the new parameter. New
unit tests cover the wildcard-rejection default, full-origin and bare-host
matches, case-insensitivity, the still-rejected unrelated origin, CLI parsing,
and config validation.

**Why:** An explicit allowlist is the option Codex recommended and the correct
security posture: it does not auto-trust arbitrary origins simply because the
server is bound to `0.0.0.0`, so the DNS-rebinding defense is preserved (a
disallowed origin is still rejected with `403` before any work) while the
documented remote-binding use case becomes possible. The empty default keeps the
prior loopback-only behavior unchanged for existing deployments.

**Commit:** e8cfa0f -- fix(transport): address fourth-round Codex review feedback for PR #83
