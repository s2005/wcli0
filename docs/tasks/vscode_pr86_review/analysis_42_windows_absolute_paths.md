# Analysis 42 - Recognize Windows absolute paths on non-Windows hosts

## Decision: Valid - fix applied

Node's `path.isAbsolute` is host-specific: on a WSL/Linux extension host it
resolves to `path.posix.isAbsolute`, which returns false for a Windows path like
`C:\Users\me` or a UNC path, so `resolvedPath`/`pathValue` (argsBuilder) and
`resolveConfigPath` (configFile) treated such paths as workspace-relative and
rewrote them (e.g. `/ws/C:\Users\me`). Added an exported `isAbsolutePath` helper
in `argsBuilder.ts` that returns true when EITHER `path.win32.isAbsolute` or
`path.posix.isAbsolute` accepts the value, and replaced all three host-specific
checks with it (configFile imports the shared helper).

**Why:** The extension resolves paths the server later consumes, and a Windows
absolute path must stay absolute regardless of which OS the extension host runs
on. Checking both POSIX and Win32 semantics is the standard cross-host fix and
keeps allowed directories, cwd, config file, and node script paths intact under
WSL. `path.relative`-derived checks (commands.toPortablePath) stay host-specific
because they operate on freshly host-joined paths.

**Commit:** 52c2bb8 - fix(vscode): address Codex round-6 review feedback for PR #86
