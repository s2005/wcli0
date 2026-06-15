# Analysis 57 - Prevent extraArgs from defeating forced stdio

## Decision: Valid — fix applied

A new `stripTransportArgs` helper removes any `--transport` entry (separate value or
`--transport=` form) from `extraArgs`. It is applied whenever the extension emits its
own `--transport`: the managed-config launch (always forced stdio), the
referenced-config forced-stdio path, and the explicit network-transport path. When the
extension emits no `--transport` (plain stdio, no config file) a user's `--transport`
in extraArgs is left untouched.

**Why:** yargs parses a repeated string option as an array, and the server's
`applyCliTransport` (`src/utils/config.ts`) only matches a scalar string, so a second
`--transport` makes it apply neither value and silently fall back to the referenced
config's transport. For a provider (stdio) launch that produced a process that opened a
network listener but never spoke over stdio. Dropping the conflicting override keeps the
forced stdio in effect. Verified by `P57` tests in `argsBuilder.test.cjs` (managed and
referenced-config stripping, and passthrough when no transport is emitted).

**Commit:** 838acc4 — fix(vscode): address Codex round-7 review feedback for PR #86
