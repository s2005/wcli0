# Analysis 95 - Mask inherited shells when writing a pinned config

## Decision: Valid — fix applied

Confirmed bug in the `ignoreInheritedShells` feature (P92). When a workspace sets
`ignoreInheritedShells: true`, `hasPerShellConfig` correctly returns false so the launch uses the
global CLI flags. But a plain launch is still pinned to a generated config when an implicit
`~/.win-cli-mcp/config.json` (P66) or `<launch.cwd>/config.json` (P74) exists — the provider calls
`writeManagedConfig(settings)` → `buildConfigFile(settings)`, and `buildConfigFile` applied the
deep-merged, inherited `s.shells` entries (`vscode-extension/src/configFile.ts:490` and the
`hasPerShellPaths`/`isShellEnabled` reads), so inherited shell executables and security overrides took
effect despite the opt-out.

Fix: at the top of `buildConfigFile`, when `ignoreInheritedShells` is set, treat `shells` as empty
(`const s = sInput.ignoreInheritedShells ? { ...sInput, shells: {} } : sInput;`). Every shell entry is
then built from `SHELL_DEFAULTS` plus the legacy single-shell selector (`wcli0.shell`) and the global
security/limits — matching the CLI-flag launch the opt-out promises. This also makes Generate Config
File consistent with the opt-out.

**Why:** the opt-out's contract is "this scope ignores inherited per-shell config and launches with
global flags." A pinned/generated config exists only to neutralize an implicit `config.json`; it must
therefore encode the same global-flag settings, not silently reintroduce the inherited per-shell
config the user opted out of. Covered by two unit tests in `configFile.test.cjs` (P95): one asserts the
inherited executable/security override is stripped and `enabled` follows `wcli0.shell`; one asserts
overrides are still applied when the flag is off.

**Commit:** d83e1c4 — fix(vscode): address PR86 round-14 review (P95-P98 per-shell mask, scope, display config)
