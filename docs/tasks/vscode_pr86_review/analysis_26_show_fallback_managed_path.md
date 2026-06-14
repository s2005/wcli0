# Analysis 26 - Show the provider's fallback managed-config path

## Decision: Valid - fix applied

`showLaunchCommand` built the managed `--config` path from the `managedConfigDir`
value passed at activation, which is `undefined` when the storage dir could not be
created (P8) - producing a bare relative `managed-config.json` that does not match
where the provider actually writes the file. Added `managedConfigTargetDir()` to
the provider (resolving the same `managedConfigDir ?? privateDir()` fallback used
at launch) and changed `showLaunchCommand` to accept the provider and use it;
`extension.ts` now passes `provider` instead of `managedConfigDir`.

**Why:** The advertised "resolved launch command" must match what the provider
registers, or copying it references a nonexistent config file. Reuses the
provider's own resolution so the two never diverge.

**Commit:** cf7e17e - fix(vscode): address Codex round-3 review feedback for PR #86
