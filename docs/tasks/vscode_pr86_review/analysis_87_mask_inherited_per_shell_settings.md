# Analysis 87 - Let workspaces mask inherited per-shell settings

## Decision: Deferred — needs a UI affordance and a product decision

The concern is real: VS Code deep-merges object-valued settings across scopes, so when User scope
defines a non-empty `wcli0.shells`, a Workspace that clears all per-shell fields cannot return the
effective config to the CLI-flag path. The current host code converts the empty `{}` to `undefined`
(removing the Workspace key), which re-exposes the inherited User object via the merge. No code change
is applied in this round.

**Why:** a clean fix is not achievable with a small, safe edit, and the test harness cannot even
reproduce the real behavior:

- VS Code merges object settings by deep merge, so a Workspace `{}` (or an absent key) does NOT
  override User keys; persisting `{}` instead of clearing would not mask anything. Overriding a
  nested per-shell value (e.g. `enabled: false`) is itself "meaningful" to
  `isMeaningfulShellConfig`, so it keeps the launch in managed per-shell mode rather than restoring
  the CLI-flag path, and disabling every inherited shell would leave the server with no enabled
  shell.
- The form has no control that expresses "do not inherit per-shell configuration"; clearing the
  fields is currently (and reasonably) interpreted as "inherit". The reviewer's suggested fix
  ("mask or disable inherited shells") therefore requires a new UI affordance plus host logic, and a
  product decision on whether clearing should mean inherit or mask.
- The unit test stub (`test/stubs/vscode.cjs`) models scope resolution as replace, not deep-merge, so
  it cannot validate a real masking fix; reproducing this needs an integration test against VS Code's
  actual merge semantics.

Surfaced to the maintainer for a follow-up: introduce an explicit "ignore inherited per-shell
configuration" toggle (persisted as an explicit Workspace representation) rather than overloading the
empty-fields state. The thread is left unresolved so it is not lost.
