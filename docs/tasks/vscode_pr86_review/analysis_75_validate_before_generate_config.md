# Analysis 75 - Validate settings before generating config.json

## Decision: Valid — fix applied

`generateConfigFile` called `buildConfigFile` directly with no validation, so settings the server
rejects — `commandTimeout`/`maxCommandLength` below 1, out-of-range per-shell security limits, or an
unresolved per-shell path — were silently dropped, producing a runnable file that uses defaults or
different restrictions than the user requested. `generateConfigFile` now runs
`validateLaunchSpec(settings, /*managed*/ true)` (the same ruleset the provider applies to its managed
config) and refuses with an explanatory error when any blocking problem remains, so a mismatched
artifact is never written.

**Why:** The generated config is the managed (config-file) representation, so the managed validation is
the correct ruleset — it already mirrors the server's `validateConfig` bounds. Launch-method problems
(empty/unanchorable node script or custom command/args) are filtered out via a small
`LAUNCH_METHOD_PROBLEM` matcher because the config file carries no launch method, so blocking generation
on them would be a false positive. This matches the established pattern of `writeWorkspaceMcpJson`,
which also refuses to emit an artifact that would silently drop settings. Verified by added `P75` tests
in `commands.test.cjs` (refuses `commandTimeout: 0.5` with a `commandTimeout` error and writes nothing;
still generates when only a launch-method problem is present).

**Commit:** 12f75fa — fix(vscode): address Codex round-10 review feedback for PR #86
