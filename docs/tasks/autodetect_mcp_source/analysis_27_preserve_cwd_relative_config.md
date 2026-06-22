# Analysis 27 - Preserve cwd-relative --config when saving file sources

## Decision: Valid — fix applied

When re-saving a loaded `.vscode/mcp.json` stdio source, `buildLaunchSpec(..., { resolvePaths:
false })` ran every plain relative path arg through `pathValue`, which anchored it to a
`${workspaceFolder}` token. For an entry with a non-workspace `cwd` that was wrong: the
server resolves `--config config.json` (and `--allowedDir` / `--initialDir` /
`--logDirectory`) against its own `cwd`, so an unrelated Save silently retargeted the
config from `<cwd>/config.json` to `${workspaceFolder}/config.json`, changing which shells
or safety settings load. A new `preserveRelativePaths` build option (set only for the
file-source save in `writeMcpJsonFromSettings`) now keeps a plain relative path arg
verbatim — and `cwd` itself round-trips verbatim too — so the entry launches the same file
it was loaded with. Settings-driven exports keep the existing `${workspaceFolder}`
anchoring, matching how the provider resolves relative path settings against the workspace.

**Why:** This mirrors the established `nodeScriptArg` rule (a relative node script with a
configured `cwd` stays relative rather than workspace-anchored, P30) and extends it to the
other relative path args, which share the same cwd-resolution semantics. The signal had to
be file-source vs settings-export, not merely "cwd is set": a settings export with a
relative `cwd` must still anchor relative path settings to the workspace (existing P1
behavior, kept green), because the provider absolutizes them against the workspace before
launch. Covered by argsBuilder.test.cjs P27 (preserveRelativePaths keeps relative args
verbatim; the settings export still anchors) and commands.test.cjs P27 (a file save
preserves a cwd-relative `--config`).

**Commit:** a233fef — fix(vscode): address review feedback for PR #89 (round 5)
