# Analysis 46 - Resolve relative custom executable paths before provider launch

## Decision: Valid - fix applied

For `launchMethod: 'custom'`, `buildLaunchSpec` only ran the command through
`resolveVariables`, leaving a relative path-like command (e.g. `./bin/server`)
unanchored; the provider launches from a private extension dir, so it resolved
there and failed. Added `customCommandValue`: when resolving paths and the command
is path-like (contains a `/` or `\`), relative, and no `launch.cwd` is set, anchor
it to the workspace folder; with a cwd set the relative command resolves against
it, and a bare PATH command (no separator) is left untouched. Added
`isUnanchorableCustomCommand` and a blocking `validateLaunchSpec` problem for a
relative path-like command with neither a cwd nor a workspace folder. The
mcp.json path (`resolvePaths: false`) is unchanged - VS Code defaults its cwd to
the workspace.

**Why:** This mirrors the round-5 P30 node-script handling (anchor relative,
reject unanchorable) and keeps the provider launch consistent with an exported
mcp.json. The path-separator heuristic matches OS exec semantics (a bare name is a
PATH lookup, a separator means resolve-against-cwd), so `npx`/`wcli0` stay PATH
commands while `./bin/server` is anchored.

**Commit:** 11d813f - fix(vscode): address Codex round-6 review feedback for PR #86
