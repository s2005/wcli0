# Analysis 9 - Avoid using the shared temp directory as the server cwd

## Decision: Valid - fix applied

The provider fell back to `os.tmpdir()` for the process cwd (and managed-config
dir) when no private cwd was injected. Since `loadConfig` reads `config.json` from
the process cwd, a world-writable shared temp root lets another user plant
`/tmp/config.json` and control safety settings or shell executables. Added a
`privateDir()` helper that returns the injected `safeCwd` when present, otherwise
lazily creates a unique `fs.mkdtempSync(os.tmpdir()/wcli0-*)` directory (cached,
falling back to the shared root only if even mkdtemp fails) and routed both
`def.cwd` and `writeManagedConfig` through it.

**Why:** A uniquely created, extension-owned directory removes the multi-user
planting vector while preserving the no-auto-load-from-workspace behavior. P1
security finding.

**Commit:** 07629c2 - fix(vscode): address Codex round-2 review feedback for PR #86
