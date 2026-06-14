# Analysis 6 - Preserve per-shell settings in mcp.json exports

## Decision: Valid - fix applied

`writeWorkspaceMcpJson` built the stdio entry from `buildLaunchSpec` with global
CLI flags only, so when `wcli0.shells` configured shells individually the
committed `.vscode/mcp.json` silently dropped every per-shell setting (the
auto-provider instead launches those via a managed `--config` file). Because a
committed mcp.json must be portable and there is no portable absolute path for a
generated managed config, the safe fix is to refuse the export: when
`hasPerShellConfig(settings)` and transport is stdio, show an error directing the
user to generate a config file and reference it via `wcli0.configFile` (or clear
`wcli0.shells`).

**Why:** Writing a mismatched entry is worse than refusing - it would launch with
different enabled shells or weaker restrictions than configured. Refusing matches
one of Codex's two suggested options and reuses the existing config-file generator.

**Commit:** 07629c2 - fix(vscode): address Codex round-2 review feedback for PR #86
