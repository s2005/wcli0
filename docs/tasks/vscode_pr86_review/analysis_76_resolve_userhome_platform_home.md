# Analysis 76 - Resolve userHome with the platform home directory

## Decision: Valid — fix applied

`resolveVariables` resolved `${userHome}` from `process.env.HOME ?? process.env.USERPROFILE`. On
Windows where `HOME` is set by Git/Cygwin/other Unix-like tools, this preferred a Unix-style path
(e.g. `/home/me`) over the real Windows user home, so any cwd, config file, allowed directory, or
per-shell executable using the token resolved to the wrong path. It now uses `os.homedir()`, which
returns the platform home (USERPROFILE on Windows, `$HOME` on POSIX) and matches VS Code's own
`${userHome}` resolution.

**Why:** `os.homedir()` is the platform-correct resolution and aligns the extension with how VS Code
expands the same token in settings, eliminating the Windows mismatch while preserving POSIX behavior
(it still honors `$HOME` there). Verified by the updated `P76` test in `settings.test.cjs` (asserts
`${userHome}` resolves to `os.homedir()`) and an added Windows-specific test (a Unix-style `HOME` no
longer leaks into the resolved value on win32).

**Commit:** 12f75fa — fix(vscode): address Codex round-10 review feedback for PR #86
