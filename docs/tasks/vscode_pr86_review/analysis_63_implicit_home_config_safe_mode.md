# Analysis 63 - Prevent implicit home configs from overriding safe mode

## Decision: Valid — fix applied

In safe mode with no `wcli0.configFile`, the extension emitted no override and no
warning, yet the server's `loadConfig` still falls back to `~/.win-cli-mcp/config.json`
(after the private cwd). An existing home config could therefore disable
injection/directory restrictions or replace shell executables while the extension
reported safe mode. `validateLaunchSpec` gained an optional `homeConfigPresent` argument;
when `!managed && safetyMode === 'safe' && configFile` is unset and that home config
exists, it emits a non-blocking warning that the file's settings take effect and are not
overridden by the extension. A shared `homeConfigExists()` helper in `mcpProvider.ts`
(reused by `commands.ts`) supplies the flag from the real filesystem; the launch and the
Show-Launch-Command path both pass it.

**Why:** the provider already isolates the cwd to avoid `<workspace>/config.json`, but
the home fallback is a separate code path it could not previously surface. Managed mode
passes an explicit `--config`, so the home fallback never applies there and no warning is
emitted. Gating the warning on the file actually existing avoids noise on the common
no-home-config case while still flagging the genuine reduced-protection scenario;
`validateLaunchSpec` stays pure (the fs check lives in the callers). Verified by `P63`
tests in `argsBuilder.test.cjs` (warning present/absent by flag, configFile, and mode).

**Commit:** d85a780 — fix(vscode): address Codex round-8 review feedback for PR #86
