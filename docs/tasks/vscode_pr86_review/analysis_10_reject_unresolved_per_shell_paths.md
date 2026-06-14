# Analysis 10 - Reject unresolved per-shell paths before managed launch

## Decision: Valid - fix applied

`applyPerShellOverrides` silently drops per-shell `allowedPaths`/`initialDir`
entries that don't resolve, and `validateLaunchSpec` only checked the global
paths. Added a managed-mode block in `validateLaunchSpec` that iterates
`SHELL_NAMES`, applying the same `isUnanchorablePath` check to each shell's
`overrides.paths.allowedPaths` and `initialDir` and emitting a blocking problem
(scoped to non-managed runs, since per-shell config only takes effect in managed
mode).

**Why:** A dropped per-shell allowed path can leave that shell with no usable
allowed paths (or the wrong initial directory); the provider should refuse, the
same way it refuses unresolved global paths, rather than launch a misconfigured shell.

**Commit:** 07629c2 - fix(vscode): address Codex round-2 review feedback for PR #86
