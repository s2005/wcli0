# Analysis 15 - Reject relative paths when no workspace can anchor them

## Decision: Valid - fix applied

`resolvedPath` returned a bare relative value unchanged when no workspace folder
was open, so `allowedDirectories: ["src"]` was emitted as `--allowedDir src` and
the server's `normalizeWindowsPath` C-rooted it to `C:\src` (an unrelated
directory). Changed `resolvedPath` to return `undefined` for an unanchorable
relative path (so it is dropped from args), and added an `isUnanchorablePath`
helper used by `validateLaunchSpec` for `cwd`, `initialDir`, `allowedDirectories`,
`logDirectory`, and `configFile` so the ambiguous configuration is reported as
blocking instead of silently dropped or misdirected.

**Why:** A relative path with no anchor is ambiguous and a security risk for
allowed directories; refusing is consistent with the existing token-unresolved
handling and prevents allowing an unintended root-level directory.

**Commit:** 07629c2 - fix(vscode): address Codex round-2 review feedback for PR #86
