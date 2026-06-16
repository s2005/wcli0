# Analysis 14 - Reject invalid per-shell security limits instead of dropping them

## Decision: Valid - fix applied

Per-shell `commandTimeout`/`maxCommandLength` below 1 were silently dropped by
`posNum` in `applyPerShellOverrides`, while the equivalent invalid global values
are blocking in `validateLaunchSpec`. Added a managed-mode check in
`validateLaunchSpec` that flags any per-shell `commandTimeout`/`maxCommandLength`
that is non-null and not a finite number `>= 1`, matching the `posNum` acceptance
the config uses.

**Why:** Per-shell mode should not misleadingly accept a setting that silently
does not take effect; refusing is consistent with the global-limit behavior and
with the server's `validateConfig`, which rejects values `< 1` at startup.

**Commit:** 07629c2 - fix(vscode): address Codex round-2 review feedback for PR #86
