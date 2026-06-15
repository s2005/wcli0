# Analysis 85 - Reject config files that cannot actually be loaded

## Decision: Valid — fix applied

`validateLaunchSpec` gained a `configFileLoadable` parameter (defaulting true so it stays pure and
existing callers are unaffected). When a non-managed launch references a `wcli0.configFile` whose
resolved path is NOT loadable, it now emits a blocking problem. Loadability is computed by the
callers from the filesystem: a new `configFileIsLoadable` helper in `mcpProvider.ts` mirrors the
server's `loadConfig` (`fs.statSync().isFile()` + `JSON.parse(fs.readFileSync())`, false on any
failure). The provider injects it (sixth constructor argument, defaulted) and passes the result;
`showLaunchCommand` and `writeWorkspaceMcpJson` compute it too (the latter via an injectable argument
so tests can use the in-memory filesystem). A new exported `resolvedConfigFilePath` resolves the
configFile the same way the launch does, so the very file the server would read is the one checked.

**Why:** the server's `loadConfig` (`src/utils/config.ts:135`) iterates
`[configPath, <cwd>/config.json, ~/.win-cli-mcp/config.json]`, catches read/parse failures and
silently falls through to the next candidate. A missing, unreadable, directory, or malformed
`wcli0.configFile` therefore does NOT pin the launch — the provider skips its implicit-config
protection (it treats a non-empty configFile as an explicit pin) while the server loads an implicit
config that can replace shell executables or weaken restrictions. Blocking the launch refuses the
broken pin rather than registering a silently-overridable server. Verified by the `P85` tests in
`argsBuilder.test.cjs` (validator) and `mcpProvider.test.cjs` (provider registers nothing and logs the
problem when the file does not load; registers normally when it does).

**Commit:** a31e500 — fix(vscode): address Codex round-12 review feedback for PR #86
