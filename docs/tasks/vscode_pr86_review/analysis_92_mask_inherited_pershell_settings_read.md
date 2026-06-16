# Analysis 92 - Allow workspaces to mask inherited per-shell settings (read site)

## Decision: Valid concern — Deferred (re-raise of P87, same blockers)

This is the same underlying limitation already analyzed and deferred in P87
([[analysis-87-mask-inherited-per-shell-settings]]), now pointed at the read site
(`vscode-extension/src/settings.ts:157`, `g<ShellsConfig>('shells', {})`) rather than the form
(`webview.ts:249`). The reviewer is correct that the root cause lives here: the getter resolves
`wcli0.shells` through VS Code's configuration API, which **deep-merges** object-valued settings across
scopes. A Workspace cannot remove a field set at User scope by clearing it — clearing removes the
Workspace override and re-exposes the inherited User value, while the workspace-scoped form shows
nothing.

Why it remains deferred (unchanged from P87):

- A correct fix cannot rely on `get()` for `shells`; it needs per-scope reads via `inspect()`
  (`workspaceValue` / `globalValue`) plus an explicit representation of "do not inherit this shell",
  because an empty `{}` deep-merges to a no-op and a nested `enabled: false` still counts as a
  meaningful per-shell override (keeping the launch in managed mode rather than restoring the CLI-flag
  path).
- This requires a dedicated UI affordance (a "mask / don't inherit" control) and a product decision on
  whether clearing means inherit or mask — not a small, safe edit.
- The unit-test stub (`test/stubs/vscode.cjs`) models scope resolution as replace, not deep-merge, so
  it cannot reproduce or validate a real masking fix; an integration test against VS Code's actual
  merge semantics is required.

**Recommendation:** keep deferred and consistent with P87 — introduce an explicit "ignore inherited
per-shell configuration" toggle persisted as a concrete Workspace representation, plus `inspect()`-based
reads, in a dedicated follow-up. Leave the thread unresolved so it is not lost.

**Status:** implemented via the dedicated follow-up — the `wcli0.ignoreInheritedShells` boolean
(a separate, non-merged setting) gates `hasPerShellConfig`, letting a Workspace opt out of inherited
per-shell mode. Covered by unit tests plus a real-host deep-merge integration test. See
[[mask_inherited_per_shell_config]] and [[comment_92_mask_inherited_pershell_settings_read]].
