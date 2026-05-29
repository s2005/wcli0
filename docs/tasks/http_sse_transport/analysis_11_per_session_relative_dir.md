# Analysis 11 - Anchor relative working directories to the calling session

## Decision: Valid -- fix applied

The previous round isolated `session.activeCwd` but kept the process-global
`process.chdir()` in `set_current_directory`, reasoning that command execution
always spawns with an explicit cwd. That holds for the no-`workingDir` path
(which uses the already-absolute `session.activeCwd`) and for Windows/Git Bash
shells (whose paths are absolutized by `normalizeWindowsPath`), but not for a
relative `workingDir` on a unix-format shell (WSL/bash) when restrictions are
disabled: that path reached `spawn({ cwd })` verbatim and resolved against the
shared process cwd, which another session had mutated via `process.chdir()`. The
fix adds `CLIServer.resolveWorkingDirForSession()`, called in the
`execute_command` handler right after `normalizePathForShell`, which resolves a
relative `workingDir` against `session.activeCwd` (POSIX semantics for
`/`-rooted bases, Windows otherwise) and leaves absolute paths and the
no-active-directory case untouched. New tests in `sessionIsolation.test.ts`
prove the same relative input resolves to each session's own directory and that
absolute paths are passed through unchanged.

**Why:** The user-selected approach keeps `process.chdir()` so stdio behavior
and the existing `setCurrentDirectory.test.ts` suite (which asserts `chdir` is
called) remain valid, while closing the cross-session leak at the exact point it
occurs -- the spawn cwd. Anchoring relative paths to the session's active
directory is also the intuitively correct behavior (equivalent to a shell `cd`
followed by a relative path) and, because resolution happens before the
`restrictWorkingDirectory` validation, the resolved path is still checked
against the allowed paths, so security is unchanged.

**Commit:** 16d7070 -- fix(transport): address fourth-round Codex review feedback for PR #83
