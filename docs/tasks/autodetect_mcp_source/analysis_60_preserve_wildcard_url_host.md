# Analysis 60 - Preserve a user-authored wildcard URL host on a port-only file save

## Decision: Valid — fix pending

For a loaded http/sse file source, `writeMcpJsonFromSettings` writes the URL as
`preservedFileUrl(settings, urlBase)`, falling back to a freshly built
`http://<clientHost>:<port>/<path>` (commands.ts:727-733). `preservedFileUrl`
(commands.ts:229-264) returns the verbatim URL only
while the host AND port still match what it decomposes to, so a port-only edit makes it return
`undefined` and the rebuild branch runs. `clientHost` (mcpProvider.ts:407-413) maps the wildcard
bind hosts `0.0.0.0 -> 127.0.0.1` and `:: / [::] -> [::1]`, so a committed
`http://0.0.0.0:9444/mcp` whose port the user changes to 8080 is written as
`http://127.0.0.1:8080/mcp`: the untouched host silently changes value, with `ok = true`, no
error, and no parse note. The no-op save preserves `0.0.0.0` exactly (same function, host and
port match), so the round trip is internally inconsistent.

`parseMcpEntry` compounds this: `isCanonicalTransportUrl` (configSource.ts:710-721) returns true
for a wildcard `http://0.0.0.0:9444/mcp`, so the parser emits NO note — the user gets no warning
that editing the port will rewrite the host, and the form offers no way to keep `0.0.0.0`/`[::]`
while changing the port.

**Why:** A save must change only the field the user edited (invariant: never silently change an
untouched field). The `clientHost` bind -> connect normalization is a settings-export concept
(build a connectable URL from a bind-host setting) and is correct there
(`commands.test.cjs` exercises it on the no-`baseEntry` path); applying it in the file-source
rebuild mutates a host that came from a user-authored connect URL. This is the
preserve-the-loaded-URL class behind P5/P8/P10/P41, but those preserve a URL while host/port are
unchanged or model default-port/socket URLs (which DO carry notes); here a canonical wildcard URL
is silently rebuilt on an unrelated port edit with no note. See [[analysis_5_preserve_http_sse_urls]]
and [[analysis_41_preserve_current_custom_urls]].

**Proposed fix:** In the file-source rebuild, reuse the loaded URL's verbatim host when only the
port changed (rebuild `host:port` from the loaded host rather than the `clientHost`-normalized
one), or skip `clientHost` for a file source so a wildcard host round-trips; alternatively emit a
note from `parseMcpEntry` for a wildcard URL so the bind -> loopback rewrite on a port edit is at
least surfaced. Add a file-source unit test: load `http://0.0.0.0:9444/mcp`, edit only the port,
assert the saved URL keeps `0.0.0.0` (and `[::]` -> `[::]`).

**Commit:** (pending)
