# Analysis 65 - Force stdio despite transport values in extra arguments

## Decision: Valid — fix applied

In `buildServerArgs`, a stdio launch now always strips any `--transport` from `extraArgs`, not just
when the extension emitted its own `--transport`. Previously, when `transport.mode` was `stdio` and
no config file was referenced, no `--transport` was emitted (`emittedTransport` stayed false) and an
`extraArgs` `--transport http` passed through unchanged, so the server opened an HTTP listener while
the provider registered an stdio definition. The stdio branch now sets the strip flag
unconditionally (the provider/mcp.json always speak stdio), and the network branch keeps stripping
as before.

**Why:** A provider-built launch is always registered as `McpStdioServerDefinition`; an extraArgs
transport override must never be able to turn it into a network listener the client never connects
to. The managed path already forced stdio (P57); this closes the remaining non-managed,
no-config-file case. Verified by an added `P65` test in `argsBuilder.test.cjs`.

**Commit:** 4c5a136 — fix(vscode): address Codex round-9 review feedback for PR #86
