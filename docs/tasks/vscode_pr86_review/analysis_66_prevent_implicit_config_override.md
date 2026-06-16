# Analysis 66 - Prevent implicit config files from overriding safe settings

## Decision: Valid — fix applied

Round 8 (P63) only warned that the server's implicit `~/.win-cli-mcp/config.json` still loads in
safe mode with no `configFile`. Codex correctly notes a warning does not prevent the override. The
provider now PINS the extension's settings: when a launch is not per-shell managed, references no
`wcli0.configFile`, and the server's implicit home config actually exists, the provider generates a
managed config from the settings and launches with `--config <generated>`. An explicit `--config`
makes `loadConfig` use the generated file instead of falling back to the home config, so the
extension's settings (and safe-mode protections) take effect. The home-config check is injected into
the provider (`homeConfigPresent`, defaulting to `homeConfigExists`) so tests are deterministic
regardless of the developer's real home directory. `showLaunchCommand` mirrors the same pinning so
the displayed command matches what is launched.

**Why:** The private cwd blocks only the `<cwd>/config.json` candidate; the home candidate is a
separate vector with no CLI flag to disable discovery, so generating an explicit config is the only
way to neutralize it. Reusing the existing managed-config machinery (`buildConfigFile` +
`buildManagedServerArgs`) keeps the settings faithful and also preserves injection protection in
safe mode (the CLI `--allowedDir` path would have disabled it). Gating on the home config actually
existing avoids changing the common case. Verified by added `P66` tests in `mcpProvider.test.cjs`
(pins when home config present; plain CLI flags when absent).

**Commit:** 4c5a136 — fix(vscode): address Codex round-9 review feedback for PR #86
