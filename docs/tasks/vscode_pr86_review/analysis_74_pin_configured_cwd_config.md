# Analysis 74 - Pin launches that use a configured cwd

## Decision: Valid — fix applied

The provider only pinned a plain launch against the implicit home config; a `config.json` sitting in a
configured `wcli0.launch.cwd` was not covered. Since `loadConfig` discovers `<cwd>/config.json` before
the home config, launching from such a cwd let that file silently replace shell executables or disable
safety settings. `provideMcpServerDefinitions` now also pins when `wcli0.launch.cwd` is configured and
contains a `config.json`: it resolves the launch cwd (from the base launch spec), checks for
`<cwd>/config.json` via a new injectable `cwdConfigExists`, and — when present and not per-shell / no
`configFile` — generates a managed config and launches with `--config`, bypassing discovery.
`showLaunchCommand` mirrors the same decision so the displayed command matches the registered one.

**Why:** The private-cwd fallback neutralizes `<cwd>/config.json` only when no cwd is configured; an
explicit cwd re-opens that vector with no CLI flag to disable discovery, exactly like the home-config
case (P66), so the same pin mechanism applies. The existence check is injected (defaulting to the real
filesystem) to keep the decision deterministic in tests and is skipped entirely when no cwd is
configured (the fallback dir has no `config.json`). Verified by added `P74` tests in
`mcpProvider.test.cjs` (pins and writes a generated `--config` when the configured cwd has a
`config.json`; plain CLI flags when it does not; the check is not invoked when `launch.cwd` is unset).

**Commit:** 12f75fa — fix(vscode): address Codex round-10 review feedback for PR #86
