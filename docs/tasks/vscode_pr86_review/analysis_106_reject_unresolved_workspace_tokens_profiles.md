# Analysis 106 - Reject unresolved workspace tokens in profiles

## Decision: Valid — fix applied

Added `hasUnresolvedExtensionVariables()` in `settings.ts` (detects leftover
extension-owned tokens `${workspaceFolder}`, `${workspaceFolder:name}`,
`${userHome}` only) and used it in `buildProfiles`: after resolving an env value,
an entry whose value still contains an unresolved extension-owned token is dropped
instead of emitted. A profile left with no env entries is then dropped by the
existing empty-env guard.

**Why:** `resolveVariables` deliberately leaves an extension-owned token intact
when it cannot be resolved (no workspace open) so callers can refuse the value,
exactly as `resolveConfigPath` already does for paths via `hasUnresolvedVariables`.
`buildProfiles` was the one emit site that skipped that check, so an unresolved
`${workspaceFolder}/bin;${PATH}` reached the managed config. The server's
`interpolateEnvValue` then expands every `${VAR}` against `process.env` and
substitutes undefined refs with an empty string, silently turning the value into
`/bin;...` and changing the command environment. A plain `hasUnresolvedVariables`
check is wrong here because server-owned tokens like `${PATH}` are intentionally
left for the server to interpolate; the new helper matches only the
extension-owned token shapes `resolveVariables` knows how to expand.

**Commit:** a98ce72 — fix(vscode): address PR87 round-17 review (P106-P107)
