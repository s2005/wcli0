# Analysis 110 - Add a way to mask inherited profiles

## Decision: Deferred — tracked as its own feature task

The concern is valid: `wcli0.profiles` is read as a merged object setting, so User
and Workspace profile maps deep-merge exactly like `wcli0.shells`. A workspace
cannot remove an inherited User profile by clearing the Profiles textarea, and
redefining a profile with only replacement env keys leaves the inherited keys in
`readSettings()`. Those stale entries are then written into the workspace managed
config and keep the mcp.json export blocked.

The fix is to give profiles the same opt-out/replacement semantics that per-shell
settings got via `ignoreInheritedShells`. That is a feature-sized change mirroring
the entire `ignoreInheritedShells` effort (which stabilized over review rounds
P87–P105): a new `wcli0.ignoreInheritedProfiles` setting (package.json), settings
read + Workspace-only recompute, `buildConfigFile` masking, `hasProfilesConfig` /
launch-mode gating, webview form control with scope availability, commands/provider
wiring, README, and tests.

**Why deferred:** It is materially larger than the other round-18 items and
warrants its own planning and incremental rollout rather than being bundled into a
review-fix commit (the shells equivalent needed several iterations to get the
form/scope semantics right). Tracked as a dedicated task at
`docs/tasks/ignore_inherited_profiles/`. The P110 review thread is left unresolved
with a reply pointing to that task.

**Status:** No code change in this commit.
