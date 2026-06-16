# Analysis 102 - Prevent custom args from defeating generated config flags

## Decision: Valid — fix applied

Confirmed bug. For the `custom` launch method, `buildLaunchSpec` prepends `s.customArgs` verbatim,
before the server flags it appends (`argsBuilder.ts:597`). When the custom command forwards to `wcli0`
(directly or via a wrapper — the only setup where the appended `--config`/`--transport` flags make
sense), a reserved flag in `customArgs` collides with the extension's own: the server's scalar yargs
`config`/`transport` options parse two values as an array, so `loadConfig` ignores the mandatory
managed/pinned config and silently falls back to an implicit `config.json`, and `applyCliTransport`
applies neither transport value, defeating forced stdio. Unlike `extraArgs` (unambiguously wcli0's,
stripped by `stripConfigArgs`/`stripTransportArgs`), `customArgs` belong to the custom command and
cannot be silently rewritten.

Fix (`validateLaunchSpec`, custom block): refuse rather than sanitize. Compute whether the extension
emits its own value — `emitsConfig = managed || configFile set`; `emitsTransport = managed ||
transportMode !== 'stdio' || configFile set` — and push a blocking problem when the corresponding
reserved flag is present in `customArgs` (detected by reusing the strip helpers:
`stripConfigArgs(customArgs).length !== customArgs.length`, same for transport). A plain stdio launch
with no managed config and no `configFile` emits neither flag, so `customArgs` remains a valid escape
hatch there.

**Why:** rejecting is the honest fix — the extension cannot know how a wrapper forwards args, so
silently dropping a `customArgs` flag could break the user's command, while leaving the conflict in
place silently defeats the managed config and forced stdio. Surfacing a blocking problem lets the user
remove the duplicate. Covered by two unit tests in `argsBuilder.test.cjs` (P102): one asserts the
collision blocks under managed mode, a pinned `configFile`, and http transport; one asserts a plain
launch keeps `customArgs` `--config`/`--transport` as an escape hatch.

**Commit:** 9d969bf — fix(vscode): address PR86 round-15 review (P99-P102)
