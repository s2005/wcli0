# Analysis 19 - Refuse to launch from the shared temp root

## Decision: Valid - fix applied

The round-2 `privateDir()` fell back to `os.tmpdir()` if `mkdtempSync` failed,
which re-opened the multi-user `config.json` planting vector that the private dir
was meant to close (P9). Changed `privateDir()` to return `string | undefined`
(no shared-root fallback), and made `provideMcpServerDefinitions` return `[]`
(logging "refusing to launch from the shared temp root") when neither a configured
`launch.cwd` nor a private dir is available; `writeManagedConfig` likewise returns
`undefined`.

**Why:** Security correctness must hold even in the failure path - launching from
a world-writable directory is worse than not launching. Follow-up to the P9 fix.

**Commit:** cf7e17e - fix(vscode): address Codex round-3 review feedback for PR #86
