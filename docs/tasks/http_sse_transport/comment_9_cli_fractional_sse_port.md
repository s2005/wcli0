# P9 - Reject fractional SSE ports from the CLI

Because `applyCliTransport` (`src/utils/config.ts:921`) runs after
`loadConfig`/`validateConfig`, the integer check in `validateTransportConfig`
is bypassed for CLI overrides. Yargs `number` options accept decimals, so
`--transport sse --sse-port 9444.5` satisfies the `ssePort > 0 && ssePort <= 65535`
condition and is assigned; `httpServer.listen()` then throws `ERR_SOCKET_BAD_PORT`
at startup instead of warning and ignoring it. Add `Number.isInteger(ssePort)`
to the guard here, or revalidate after applying CLI overrides.
