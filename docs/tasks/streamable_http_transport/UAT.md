# UAT: Streamable HTTP Transport for MCP Server

## Purpose

User Acceptance Testing for the Streamable HTTP transport feature (MCP protocol
revision 2025-03-26) implemented on branch `docs/streamable-http-transport-task`.
This document is a manual, human-runnable test plan that verifies the feature
against the acceptance criteria in [PRD.md](PRD.md) and the implementation
tracked in [progress.md](progress.md). Each test case has explicit steps, the
exact expected result, and a pass/fail box for sign-off.

Automated unit/integration coverage already exists (see
[verification.md](verification.md)); UAT focuses on confirming the behavior by
hand from a user's perspective, end to end.

## Scope

In scope:

- Transport mode selection (`stdio` default vs `http`) via CLI flags and config file
- Streamable HTTP host/port configuration and CLI-over-config precedence
- MCP protocol over Streamable HTTP: initialize, list tools, call a tool, read a
  resource, all over the single `/mcp` endpoint
- Stateful sessions keyed by `Mcp-Session-Id`: creation, routing, `DELETE`
  termination, per-session working-directory isolation
- Security: Origin validation (DNS-rebinding defense), CORS, session routing
  errors, malformed Host handling
- Lifecycle: startup bind log, graceful shutdown, port release
- Backward compatibility: stdio and legacy `sse` transports unchanged
- Automated regression and lint gates

Out of scope (per PRD non-requirements): a simultaneous `/sse` + `/mcp`
dual-endpoint bridge, authentication, TLS/SSL, resumability (event store /
`Last-Event-ID`), stateless mode, Docker/deployment changes.

## Prerequisites

- Node.js 18 or later (this machine: confirm with `node --version`).
- Repository checked out on branch `docs/streamable-http-transport-task`.
- A terminal. Commands below are written for **Git Bash** (the default shell on
  this machine). `curl` and `node` must be on `PATH` (both ship with Git Bash /
  Node). PowerShell users can substitute `curl.exe` for `curl`.
- A single terminal is sufficient for the protocol tests: unlike the legacy SSE
  transport, a Streamable HTTP `POST /mcp` returns its response on the same
  request, so no second terminal is needed to read results.

## Environment setup

The published `dist/` build predates this feature, so a fresh build is required
before any manual run. The SDK upgrade is part of this feature, so reinstall
first.

```bash
npm install
npm run build        # compiles TypeScript to dist/ (includes dist/utils/streamableHttp.js)
node --version       # confirm v18+
```

Confirm the build produced the Streamable HTTP transport module and the upgraded
SDK:

```bash
ls dist/utils/streamableHttp.js   # must exist
node -e "require('@modelcontextprotocol/sdk/server/streamableHttp.js'); console.log('streamableHttp present')"
```

### UAT config files

Create these two throwaway config files in the repo root. They are not named
`win-cli-mcp.config.json`, so the server will not auto-load them; they are only
used when passed via `--config`. Delete them after UAT.

Save as `uat-http.config.json`:

```json
{
  "global": {
    "security": {
      "maxCommandLength": 2000,
      "commandTimeout": 30,
      "enableInjectionProtection": true,
      "restrictWorkingDirectory": false
    }
  },
  "transport": {
    "mode": "http",
    "httpHost": "127.0.0.1",
    "httpPort": 9444
  }
}
```

`restrictWorkingDirectory` is set to `false` so that each session's active
working directory seeds from the launch directory and `execute_command` works
without a prior `set_current_directory` call. This keeps the protocol test cases
focused on transport behavior.

Save as `uat-bad-transport.config.json` (used only by UAT-06):

```json
{
  "transport": {
    "mode": "websocket",
    "httpHost": "127.0.0.1",
    "httpPort": 9444
  }
}
```

## Understanding the Streamable HTTP message flow

Streamable HTTP uses a single endpoint, `/mcp`, with three methods. Read this
before running Group B/C so the responses make sense:

1. **Session creation.** The client sends `POST /mcp` with an `initialize`
   JSON-RPC request and **no** session id. The server creates a session, returns
   `200`, and includes the new id in the **`Mcp-Session-Id` response header**.
   The JSON-RPC result is returned in the same response body.
2. **Response shape.** By default the server answers a `POST` with a one-shot
   Server-Sent-Events body: a single `event: message` whose `data:` line is the
   JSON-RPC response. The stream then closes, so `curl` returns immediately.
3. **Required `Accept` header.** Every `POST /mcp` must send
   `Accept: application/json, text/event-stream`. Without it the SDK rejects the
   request with `406 Not Acceptable`.
4. **Routing later requests.** The client repeats the captured id on every
   subsequent request via the `Mcp-Session-Id` request header. Notifications
   (such as `notifications/initialized`) get a `202 Accepted` with an empty body.
5. **Optional stream.** `GET /mcp` (with the session header) opens the long-lived
   server-to-client SSE stream. It is not needed for basic request/response.
6. **Termination.** `DELETE /mcp` (with the session header) ends the session.

So most manual tests use a **single terminal**: capture the `Mcp-Session-Id`
from the initialize response, then reuse it.

### Capturing the session id

`curl -D -` (dump headers) shows the `Mcp-Session-Id` line. For example:

```bash
curl -s -D - -o /dev/null -X POST http://127.0.0.1:9444/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"uat","version":"1.0.0"}}}'
# look for: Mcp-Session-Id: <uuid>
```

Copy that `<uuid>` and use it as `<SID>` in the following cases.

### Parsing responses with jq (optional)

A `POST /mcp` response is a one-shot SSE frame, not raw JSON:

```text
event: message
data: {"result":...,"jsonrpc":"2.0","id":5}
```

Piping that straight into `jq` fails, because the `event:` line and the
`data:` prefix are not valid JSON. Strip the prefix first:

```bash
... | sed -n 's/^data: //p' | tr -d '\r' | jq .
```

- `sed -n 's/^data: //p'` keeps only the `data:` line and removes the `data:`
  prefix.
- `tr -d '\r'` removes the trailing carriage return (SSE lines end in CRLF;
  without this `jq` may report `Unfinished string at EOF`).
- `jq .` pretty-prints; narrow with a filter such as `jq '.result'`.

For repeated calls, define a helper once per shell. Set `SID` from the
`Mcp-Session-Id` returned by the initialize handshake, then reuse it:

```bash
SID="<paste-your-session-id-here>"

mcp() {
  curl -s -X POST http://127.0.0.1:9444/mcp \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $SID" \
    -d "$1" | sed -n 's/^data: //p' | tr -d '\r' | jq "${2:-.}"
}
```

The first argument is the JSON-RPC request body; the optional second argument
is a `jq` filter (defaults to `.`). Examples:

```bash
mcp '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' '.result.tools[].name'
mcp '{"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"cli://config"}}' \
  '.result.contents[0].text | fromjson | .transport'
```

Notes:

- `jq` must be installed; it does not ship with Git Bash (for example
  `choco install jq`). `sed` and `tr` are already on the Git Bash `PATH`.
- Do not pipe the header-dump commands (`curl -D -`, used to read the
  `Mcp-Session-Id`) into `jq`; HTTP headers are not JSON.
- Notification requests (such as `notifications/initialized`) return `202` with
  an empty body, so there is nothing for `jq` to parse; check the status code
  instead.
- The helper targets the default `http://127.0.0.1:9444/mcp`. If you started the
  server on another port (UAT-03, UAT-05), update the URL accordingly.

### Liveness check helper

A `GET /mcp` without a session opens nothing useful, so to confirm a server is up
without hanging, hit an unknown path (returns `404` instantly):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9444/healthcheck-probe
# expect: 404
```

## Acceptance criteria traceability

| PRD acceptance criterion | UAT case(s) |
| ------------------------ | ----------- |
| AC1: SDK upgraded; lint + full suite green | UAT-22 |
| AC2: `--transport http` binds `127.0.0.1:9444` serving `/mcp`, logs bind | UAT-02 |
| AC3: `--http-host` / `--http-port` change the bind address | UAT-03 |
| AC4: client can initialize, get `Mcp-Session-Id`, run tools/list, tools/call, resources/read | UAT-07, UAT-08, UAT-09, UAT-10 |
| AC5: two concurrent sessions have isolated working directories | UAT-19 |
| AC6: `DELETE /mcp` terminates a session; later requests return `404` | UAT-18 |
| AC7: untrusted Origin `403`; no-origin allowed; configured origin + CORS | UAT-12, UAT-13, UAT-14, UAT-15 |
| AC8: malformed `Host` header `400` and the server stays alive | UAT-17 |
| AC9: config respected + CLI override; `get_config` reports active transport | UAT-04, UAT-05, UAT-11 |
| AC10: SIGINT shuts down cleanly and releases the port | UAT-20 |
| AC11: no flags still starts stdio; `--transport sse` still starts legacy SSE | UAT-01, UAT-21 |
| AC12: new transport code has unit + integration coverage | UAT-22 |
| Transport config validation, fractional port ignored | UAT-06 |
| Session routing errors (unknown session `404`, bad body `400`) | UAT-16 |

## Group A: Transport selection and configuration

### UAT-01 -- Default mode is stdio (backward compatibility)

**Objective:** With no transport flags, the server behaves exactly as before
(stdio), starting no HTTP server.

**Steps:**

1. Run: `node dist/index.js --shell gitbash`
2. Observe that the process waits on stdin and does not print any HTTP bind line.
3. In a second terminal, confirm nothing is listening on 9444:
   `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9444/probe`
4. Stop the server with `Ctrl+C`.

**Expected result:**

- The server starts and blocks on stdin (no port opened).
- The `curl` probe fails to connect (connection refused), not a `404`.
- `Ctrl+C` exits cleanly.

**Maps to:** AC11. Result: [ ] Pass [ ] Fail

### UAT-02 -- Streamable HTTP on default host/port with startup log

**Objective:** `--transport http` starts an HTTP server on `127.0.0.1:9444`
serving `/mcp` and logs the bind address.

**Steps:**

1. Run: `node dist/index.js --shell gitbash --transport http --debug`
   (the `--debug` flag is required to see the startup bind line, which is emitted
   via debug logging to stderr).
2. Read the startup output.
3. In a second terminal run the liveness probe:
   `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9444/probe`
4. Leave this server running for UAT-07 onward, or stop with `Ctrl+C`.

**Expected result:**

- Startup output contains:
  `Windows CLI MCP Server running on Streamable HTTP at http://127.0.0.1:9444/mcp`
- The probe returns `404` (server is up and routing).

**Maps to:** AC2. Result: [ ] Pass [ ] Fail

### UAT-03 -- Custom host and port via CLI

**Objective:** `--http-host` and `--http-port` change the bind address.

**Steps:**

1. Run: `node dist/index.js --shell gitbash --transport http --http-host 127.0.0.1 --http-port 3000 --debug`
2. Probe the new port:
   `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/probe`
3. Probe the default port to confirm it is NOT used:
   `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9444/probe`
4. Stop with `Ctrl+C`.

**Optional wildcard bind (only on a network you trust):** repeat with
`--http-host 0.0.0.0 --http-port 3000`. A Windows Firewall prompt may appear;
allow it for the test. Confirm the startup log shows `http://0.0.0.0:3000/mcp`.
See UAT-14 for the browser-origin implication of wildcard binds.

**Expected result:**

- Startup log shows `http://127.0.0.1:3000/mcp`.
- Probe on 3000 returns `404`; probe on 9444 fails to connect.

**Maps to:** AC3. Result: [ ] Pass [ ] Fail

### UAT-04 -- Config file transport section is respected

**Objective:** The `transport` section of a config file selects `http` mode with
no CLI transport flag present.

**Steps:**

1. Run: `node dist/index.js --shell gitbash --config uat-http.config.json --debug`
   (note: no `--transport` flag).
2. Read the startup output and probe port 9444.

**Expected result:**

- Startup log shows Streamable HTTP running at `http://127.0.0.1:9444/mcp`,
  proving the config file's `transport.mode: "http"` was honored without a CLI
  flag.

**Maps to:** AC9. Result: [ ] Pass [ ] Fail

### UAT-05 -- CLI flags override config file

**Objective:** A CLI `--http-port` wins over the port in the config file.

**Steps:**

1. Run: `node dist/index.js --shell gitbash --config uat-http.config.json --http-port 9555 --debug`
   (config says 9444; CLI says 9555).
2. Probe 9555 and 9444.

**Expected result:**

- Startup log shows `http://127.0.0.1:9555/mcp`.
- Probe on 9555 returns `404`; probe on 9444 fails to connect.

**Maps to:** AC9. Result: [ ] Pass [ ] Fail

### UAT-06 -- Invalid transport config is rejected; fractional port ignored

**Objective:** Bad transport configuration is caught at startup; a fractional CLI
port is rejected without crashing.

**Steps:**

1. Run with the bad config: `node dist/index.js --config uat-bad-transport.config.json`
2. Observe the fatal error and exit.
3. Run with a fractional port:
   `node dist/index.js --shell gitbash --transport http --http-port 9444.5 --debug`
4. Probe port 9444.

**Expected result:**

- Step 1/2: the process prints an error mentioning
  `transport.mode must be 'stdio', 'sse', or 'http'` and exits with a non-zero
  code (no server starts).
- Step 3: with `--debug` you see a warning that the invalid `httpPort` is
  ignored; the server still starts and falls back to the default port `9444`
  (probe on 9444 returns `404`). The process does NOT crash with
  `ERR_SOCKET_BAD_PORT`.

**Maps to:** transport config validation. Result: [ ] Pass [ ] Fail

## Group B: MCP protocol over Streamable HTTP

For all Group B tests, start a fresh Streamable HTTP server in a dedicated
terminal and leave it running:

```bash
node dist/index.js --shell gitbash --config uat-http.config.json --debug
```

### UAT-07 -- Initialize handshake assigns a session id

**Objective:** `POST /mcp` with an `initialize` request and no session id creates
a session, returns `200`, and advertises the id in the `Mcp-Session-Id` header.

**Steps:**

1. Send `initialize` and dump the response headers + body:

   ```bash
   curl -s -D - -X POST http://127.0.0.1:9444/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"uat","version":"1.0.0"}}}'
   ```

2. Copy the `Mcp-Session-Id` value from the headers for the next tests (`<SID>`).

**Expected result:**

- Status line `HTTP/1.1 200 OK` and a `Mcp-Session-Id: <uuid>` response header.
- The body is an SSE `event: message` whose `data:` JSON result contains
  `protocolVersion` (negotiated, e.g. `2025-03-26`), `serverInfo` (server
  name/version), and `capabilities`.
- The `--debug` server terminal logs `Streamable HTTP session established: <uuid>`.

**Maps to:** AC4. Result: [ ] Pass [ ] Fail

### UAT-08 -- Initialized notification and tools/list

**Objective:** The handshake completes and tools are listed over `/mcp` using the
session header.

**Steps (use the `<SID>` from UAT-07):**

1. Send the initialized notification:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:9444/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -H "Mcp-Session-Id: <SID>" \
     -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
   ```

2. Request the tool list:

   ```bash
   curl -s -X POST http://127.0.0.1:9444/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -H "Mcp-Session-Id: <SID>" \
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
   ```

**Expected result:**

- Step 1 returns HTTP `202` (notification accepted, empty body).
- Step 2 returns an `id:2` result (in the SSE `data:` line) listing tools
  including `execute_command`, `get_current_directory`, `set_current_directory`,
  and `get_config`.

**Maps to:** AC4. Result: [ ] Pass [ ] Fail

### UAT-09 -- Execute a command tool over Streamable HTTP

**Objective:** `tools/call` for `execute_command` runs and returns output.

**Steps (same session):**

```bash
curl -s -X POST http://127.0.0.1:9444/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <SID>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"execute_command","arguments":{"shell":"gitbash","command":"echo uat-ok"}}}'
```

**Expected result:**

- The `id:3` result content text contains `uat-ok`, and the result metadata
  reports `exitCode: 0`.

**Maps to:** AC4. Result: [ ] Pass [ ] Fail

### UAT-10 -- Read a resource over Streamable HTTP

**Objective:** MCP resource read works over `/mcp`.

**Steps (same session):**

1. List resources:

   ```bash
   curl -s -X POST http://127.0.0.1:9444/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -H "Mcp-Session-Id: <SID>" \
     -d '{"jsonrpc":"2.0","id":4,"method":"resources/list"}'
   ```

2. Read the config resource:

   ```bash
   curl -s -X POST http://127.0.0.1:9444/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -H "Mcp-Session-Id: <SID>" \
     -d '{"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"cli://config"}}'
   ```

**Expected result:**

- `id:4` result lists resources including `cli://config`.
- `id:5` result returns the server configuration JSON as resource contents.

**Maps to:** AC4. Result: [ ] Pass [ ] Fail

### UAT-11 -- Active transport reported in get_config

**Objective:** The serialized config exposed to clients includes the active
Streamable HTTP transport section.

**Steps (same session):**

```bash
curl -s -X POST http://127.0.0.1:9444/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <SID>" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"get_config","arguments":{}}}'
```

**Expected result:**

- The `id:6` result JSON contains a `transport` object reporting `mode: "http"`,
  `httpHost: "127.0.0.1"`, and `httpPort: 9444`.

**Maps to:** AC9. Result: [ ] Pass [ ] Fail

## Group C: Security

### UAT-12 -- Untrusted browser Origin is rejected (DNS-rebinding defense)

**Objective:** A request carrying an untrusted `Origin` header is rejected with
`403`, even though it reaches loopback.

**Steps:**

1. With the Streamable HTTP server running, send a request with a hostile origin:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" \
     -H "Origin: https://evil.example" \
     -H "Accept: application/json, text/event-stream" \
     http://127.0.0.1:9444/mcp
   ```

**Expected result:**

- HTTP `403`. The server terminal (`--debug`) logs
  `Rejected Streamable HTTP request from disallowed origin: https://evil.example`.

**Maps to:** AC7. Result: [ ] Pass [ ] Fail

### UAT-13 -- No-Origin and loopback origins are allowed

**Objective:** Non-browser clients (no `Origin`) and loopback-origin requests are
permitted.

**Steps:**

1. No Origin (default curl):
   `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9444/probe`
   (expect `404`, i.e. routed, not blocked).
2. Loopback origin against an unknown path:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" \
     -H "Origin: http://localhost" \
     http://127.0.0.1:9444/probe
   ```

**Expected result:**

- Both return `404` (request was accepted by the origin check and fell through to
  the not-found handler) -- NOT `403`.

**Maps to:** AC7. Result: [ ] Pass [ ] Fail

### UAT-14 -- Configured allowed origin is admitted

**Objective:** `--http-allowed-origins` admits a browser origin that is neither
loopback nor the bind host.

**Steps:**

1. Start a server with an allowed origin:

   ```bash
   node dist/index.js --shell gitbash --transport http \
     --http-allowed-origins "https://app.example.com" --debug
   ```

2. Send a request with that origin and inspect headers:

   ```bash
   curl -s -D - -o /dev/null \
     -H "Origin: https://app.example.com" \
     http://127.0.0.1:9444/probe
   ```

3. Send a request with a different, non-listed origin (expect rejection):

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" \
     -H "Origin: https://other.example.com" \
     http://127.0.0.1:9444/probe
   ```

**Expected result:**

- Step 2: status `404` (accepted by origin check) and the response includes
  `Access-Control-Allow-Origin: https://app.example.com` and `Vary: Origin`.
- Step 3: status `403`.

**Maps to:** AC7. Result: [ ] Pass [ ] Fail

### UAT-15 -- CORS preflight (OPTIONS) is answered

**Objective:** A cross-origin preflight returns `204` with CORS headers so a real
browser POST is not blocked.

**Steps (against the server from UAT-14):**

```bash
curl -s -D - -o /dev/null -X OPTIONS \
  -H "Origin: https://app.example.com" \
  -H "Access-Control-Request-Method: POST" \
  http://127.0.0.1:9444/mcp
```

**Expected result:**

- Status `204`.
- Headers include `Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS`,
  `Access-Control-Allow-Headers` listing `Mcp-Session-Id`, and
  `Access-Control-Allow-Origin: https://app.example.com`.

**Maps to:** AC7. Result: [ ] Pass [ ] Fail

### UAT-16 -- Session and body routing errors

**Objective:** Requests without a valid session, or with an unreadable body, are
rejected with the correct status codes.

**Steps (against any running Streamable HTTP server):**

1. Unknown `Mcp-Session-Id`:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:9444/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -H "Mcp-Session-Id: does-not-exist" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

2. No session id and not an initialize request:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:9444/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```

3. Malformed JSON body:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:9444/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{ this is not valid json'
   ```

**Expected result:**

- Step 1: `404` (unknown/terminated session).
- Step 2: `400` (no valid session id for a non-initialize request).
- Step 3: `400` (parse error). The server stays alive.

**Maps to:** session routing. Result: [ ] Pass [ ] Fail

### UAT-17 -- Malformed Host header does not crash the server

**Objective:** A request with an unparseable `Host` header returns `400` and the
server stays alive (no unhandled-rejection crash).

**Steps:**

1. Send a raw request with a bad Host header using Node (reliable; curl would
   normalize the header):

   ```bash
   node -e "const net=require('net');const s=net.connect(9444,'127.0.0.1',()=>s.write('POST /mcp HTTP/1.1\r\nHost: %%%%\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'));s.on('data',d=>process.stdout.write(d.toString()));"
   ```

2. After it prints, confirm the server is still up with the liveness probe:
   `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9444/probe`

**Expected result:**

- Step 1 output starts with `HTTP/1.1 400 Bad Request` and body `{"error":"Bad Request"}`.
- Step 2 returns `404` -- the server did not crash.

**Maps to:** AC8. Result: [ ] Pass [ ] Fail

## Group D: Sessions and lifecycle

### UAT-18 -- DELETE terminates a session

**Objective:** `DELETE /mcp` with a valid session id terminates it; later
requests for that id return `404`.

**Steps:**

1. Create a fresh session (UAT-07) and capture its `<SID>`. Complete the
   initialized notification (UAT-08 step 1).
2. Terminate it:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://127.0.0.1:9444/mcp \
     -H "Mcp-Session-Id: <SID>"
   ```

3. Try to use the terminated session:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:9444/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -H "Mcp-Session-Id: <SID>" \
     -d '{"jsonrpc":"2.0","id":9,"method":"tools/list"}'
   ```

**Expected result:**

- Step 2 returns `200` (session terminated). The `--debug` server terminal logs
  `Streamable HTTP session closed: <SID>`.
- Step 3 returns `404` (the session no longer exists).

**Maps to:** AC6. Result: [ ] Pass [ ] Fail

### UAT-19 -- Per-session working-directory isolation (advanced, optional)

**Objective:** `set_current_directory` in one session must not change the active
directory of another session on the same server.

This is exercised thoroughly by the automated suite. Manual verification uses two
sessions created against the same server. Run it if time permits.

**Steps:**

1. Create session 1 (UAT-07), capture `SID1`, complete the initialized
   notification.
2. Create session 2 the same way against the same server, capture `SID2`.
3. In session 1, set the directory to a real path that exists on this machine,
   for example the repo `src` directory:

   ```bash
   curl -s -X POST http://127.0.0.1:9444/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -H "Mcp-Session-Id: SID1" \
     -d '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"set_current_directory","arguments":{"path":"<repo>/src"}}}'
   ```

4. In session 2, query its current directory:

   ```bash
   curl -s -X POST http://127.0.0.1:9444/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -H "Mcp-Session-Id: SID2" \
     -d '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"get_current_directory","arguments":{}}}'
   ```

**Expected result:**

- Session 1 (`id:10`) confirms the directory change to `<repo>/src`.
- Session 2 (`id:11`) still reports its own original directory (the launch
  directory), NOT the path set by session 1.

**Maps to:** AC5. Result: [ ] Pass [ ] Fail [ ] Skipped

### UAT-20 -- Graceful shutdown releases the port

**Objective:** `Ctrl+C` (SIGINT) shuts the HTTP server down cleanly and frees the
port, even with a `/mcp` SSE stream still open.

**Steps:**

1. Start the server: `node dist/index.js --shell gitbash --config uat-http.config.json --debug`
2. Create a session (UAT-07) and capture `<SID>`.
3. Open the server-to-client stream in another terminal:
   `curl -N -H "Mcp-Session-Id: <SID>" http://127.0.0.1:9444/mcp`
4. Press `Ctrl+C` in the server terminal.
5. Observe that the server process exits within a second or two (does not hang on
   the open stream).
6. Probe the port: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9444/probe`

**Expected result:**

- The server process exits promptly after `Ctrl+C`.
- The open `curl -N` stream ends.
- The probe in step 6 now fails to connect (port released), confirming the
  listener and lingering `/mcp` sockets were closed.

**Maps to:** AC10. Result: [ ] Pass [ ] Fail

## Group E: Backward compatibility and regression

### UAT-21 -- Legacy stdio and SSE transports are unchanged

**Objective:** Adding the `http` mode did not regress the existing `stdio`
(covered by UAT-01) and legacy `sse` transports.

**Steps:**

1. Start the legacy SSE transport:
   `node dist/index.js --shell gitbash --transport sse --debug`
2. Read the startup output.
3. Probe the port: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9444/probe`
4. Open the legacy SSE stream and confirm the endpoint event:
   `curl -N http://127.0.0.1:9444/sse`
5. Stop with `Ctrl+C`.

**Expected result:**

- Startup log shows `Windows CLI MCP Server running on SSE at http://127.0.0.1:9444`
  (the legacy message, with no `/mcp` suffix).
- The probe returns `404`.
- The SSE stream emits `event: endpoint` with `data: /messages?sessionId=<uuid>`,
  unchanged from before this feature.

**Maps to:** AC11. Result: [ ] Pass [ ] Fail

### UAT-22 -- Automated regression and lint gates

**Objective:** The full automated suite and the type/lint gate pass with the
feature in place.

**Steps:**

```bash
npm run lint     # tsc --noEmit
npm test         # full jest suite
```

**Expected result:**

- `npm run lint` reports no errors.
- `npm test` passes with no failures and no "worker process failed to exit
  gracefully" warning. The Streamable HTTP suites
  (`streamable-http-transport`, `streamable-http-tool-execution`,
  `streamable-http-resources`, `streamable-http-security`,
  `streamable-http-sessions`) all pass, and the legacy SSE and stdio suites
  remain green.

**Maps to:** AC1, AC12. Result: [ ] Pass [ ] Fail

## Optional: MCP Inspector smoke test

For an interactive UI alternative to the manual curl handshake:

1. Start a Streamable HTTP server:
   `node dist/index.js --shell gitbash --config uat-http.config.json`
2. In another terminal: `npx @modelcontextprotocol/inspector`
3. In the Inspector UI, choose the **Streamable HTTP** transport and connect to
   `http://127.0.0.1:9444/mcp`.
4. Confirm the connection succeeds, the tool list loads, and `execute_command`
   with `{"shell":"gitbash","command":"echo uat-ok"}` returns `uat-ok`.

Result: [ ] Pass [ ] Fail [ ] Skipped

## Results summary

| Case | Title | Result | Notes |
| ---- | ----- | ------ | ----- |
| UAT-01 | Default mode is stdio | | |
| UAT-02 | Streamable HTTP default host/port + startup log | | |
| UAT-03 | Custom host/port via CLI | | |
| UAT-04 | Config file transport respected | | |
| UAT-05 | CLI overrides config | | |
| UAT-06 | Invalid config rejected / fractional port | | |
| UAT-07 | Initialize + Mcp-Session-Id | | |
| UAT-08 | Initialized + tools/list | | |
| UAT-09 | execute_command over /mcp | | |
| UAT-10 | Resource read over /mcp | | |
| UAT-11 | Transport in get_config | | |
| UAT-12 | Untrusted origin rejected | | |
| UAT-13 | No-origin / loopback allowed | | |
| UAT-14 | Configured allowed origin admitted | | |
| UAT-15 | CORS preflight answered | | |
| UAT-16 | Session / body routing errors | | |
| UAT-17 | Malformed Host handled | | |
| UAT-18 | DELETE terminates session | | |
| UAT-19 | Per-session isolation | | |
| UAT-20 | Graceful shutdown | | |
| UAT-21 | Legacy stdio / SSE unchanged | | |
| UAT-22 | Automated regression + lint | | |
| Optional | MCP Inspector smoke test | | |

## Defects log

| ID | Case | Severity | Description | Status |
| -- | ---- | -------- | ----------- | ------ |
| | | | | |

## Cleanup

After UAT, remove the throwaway config files:

```bash
rm -f uat-http.config.json uat-bad-transport.config.json
```

## Sign-off

- Tester:
- Date:
- Build / commit under test:
- Overall verdict: [ ] Accepted [ ] Accepted with notes [ ] Rejected
