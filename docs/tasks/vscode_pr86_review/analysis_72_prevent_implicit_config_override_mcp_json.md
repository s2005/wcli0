# Analysis 72 - Prevent implicit configs from overriding exported mcp.json

## Decision: Valid — fix applied (warning, not pin; portable artifact cannot pin)

A committed stdio `mcp.json` entry with no `wcli0.configFile` emits plain CLI flags but no `--config`,
so the server's `loadConfig` still discovers `<workspace>/config.json` (VS Code defaults the entry's
cwd to the workspace) and can silently override the exported settings. `writeWorkspaceMcpJson` now
detects a committed `<workspace>/config.json` and shows a modal warning ("…can override the exported
ones…"), requiring an explicit "Write anyway" before emitting the entry, and recommends referencing
a config file via `wcli0.configFile` (which makes the export emit `--config` and bypass discovery).

**Why:** Unlike the provider (P66), a committed mcp.json cannot pin an absolute generated config:
`buildConfigFile` bakes machine-specific absolute paths, which would break portability for teammates.
So true silent pinning is infeasible for this artifact; the proportionate mitigation is to convert the
previously silent limitation into an explicit user choice — matching the file's existing modal guards
(env secrets, JSONC comment loss). The gate checks only `<workspace>/config.json`, the override vector
that travels with the committed mcp.json; the machine-local `~/.win-cli-mcp/config.json` is already
surfaced at launch (P63) and pinned by the provider (P66), and gating on it would be non-deterministic.
Verified by added `P72` tests in `commands.test.cjs` (warns and aborts on cancel; writes on "Write
anyway"; no warning when `wcli0.configFile` is set). A `stat` method was added to the test vscode stub.

**Commit:** dac74a5 — fix(vscode): address Codex round-10 review feedback for PR #86
