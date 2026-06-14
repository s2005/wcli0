# Analysis 2 - Fall back when the private cwd cannot be created

## Decision: Valid - fix applied

The provider's documented fallback is `spec.cwd ?? this.safeCwd ?? os.tmpdir()`,
which only reaches `os.tmpdir()` when `safeCwd` is empty/undefined. `activate`
passed `context.globalStorageUri.fsPath` (always a non-empty string) and only
logged-and-continued if `mkdirSync` threw, so on read-only/permission-restricted
storage the provider would set a nonexistent directory as the stdio process cwd
and every default launch would fail. Fixed by typing `safeCwd` as
`string | undefined` and setting it to `undefined` in the catch, so the provider
falls back to its temp dir.

**Why:** `managedConfigDir` already self-heals (the provider re-runs `mkdirSync`
in `writeManagedConfig` and returns undefined on failure), but `safeCwd` had no
such retry, so the failure path needed to surface the unusable directory as
"unset" to honor the documented fallback chain.

**Commit:** 6017df8 - fix(vscode): address Codex review feedback for PR #86
