# Analysis 24 - Validate log directories rejected by the server

## Decision: Valid - fix applied

The P16 check only refused unresolved/unanchorable log directories; a path that
resolved but violated the server's `validateLoggingConfig` rules (a `..`
traversal, or on Windows the characters `<>"|?*`) still registered a server that
exits at startup. Added an `else` branch in `validateLaunchSpec` that resolves the
value and mirrors those checks (`path.normalize` for `..`, and the Windows
character set gated on `process.platform === 'win32'`, matching the server's own
platform gate).

**Why:** The extension and server run on the same machine, so mirroring the
server's platform-specific validation prevents publishing a definition that
immediately crashes. Consistency with the server's `src/utils/config.ts` checks.

**Commit:** cf7e17e - fix(vscode): address Codex round-3 review feedback for PR #86
