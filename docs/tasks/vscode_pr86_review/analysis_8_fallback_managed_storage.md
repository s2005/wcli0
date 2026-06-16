# Analysis 8 - Fall back after managed storage creation fails

## Decision: Valid - fix applied

`activate` passed `context.storageUri?.fsPath ?? context.globalStorageUri.fsPath`
(always non-empty) as `managedConfigDir` and only logged-and-continued on mkdir
failure. `writeManagedConfig` always selected that non-empty path and returned
`undefined` after the write failed, so any `wcli0.shells` configuration
registered no server even when `safeCwd`/temp was writable. Fixed by typing
`managedConfigDir` as `string | undefined` and clearing it in the catch, so the
provider falls back to its private dir (see Analysis 9).

**Why:** Mirrors the round-1 `safeCwd` fix - a failed best-effort mkdir must
surface the directory as "unset" so the documented fallback chain is actually used.

**Commit:** 07629c2 - fix(vscode): address Codex round-2 review feedback for PR #86
