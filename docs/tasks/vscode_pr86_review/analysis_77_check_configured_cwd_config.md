# Analysis 77 - Check the exported entry's configured cwd for config.json

## Decision: Valid — fix applied

The P72 warning checked only `<workspace>/config.json`, missing the case where `wcli0.launch.cwd`
points elsewhere and the exported entry launches from that cwd. A new `launchCwdUri` helper resolves
the directory the entry would actually run in — the configured `launch.cwd` (variable-resolved and
anchored to the workspace when relative) or the workspace folder when unset — and the renamed
`implicitConfigIn(dir)` stats `<dir>/config.json` there. The warning now fires for a `config.json` in
the configured cwd and not merely the workspace root.

**Why:** `loadConfig` discovers `config.json` from `process.cwd()`, which for the exported entry is
`launch.cwd` when set (VS Code only defaults the omitted cwd to the workspace). Resolving the same
directory the entry uses makes the existence check match the real discovery vector. Verified by added
`P77` tests in `commands.test.cjs` (warns for `<cwd>/config.json`; a workspace-root `config.json`
does not warn when `launch.cwd` points elsewhere).
