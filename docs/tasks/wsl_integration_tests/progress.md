# WSL2 Integration Tests — Progress

## Review Feedback (PR #82)

- [x] P1: Preserve Unix root `/` in `normalizeAllowedPaths` (fixed — guard against stripping `/` to `''`; fix nesting/child detection for root path)
- [-] P2: WSL cwd conversion without `.exe` suffix (rejected — `.exe` check is intentional for dual-platform WSL scenario)
- [x] P3: Skip Git Bash tests when unavailable (fixed — replaced `if (!server) return` with `describe.skip`; removed early-return guards)

## Review Feedback Round 2 (PR #82)

- [x] P4: WSL cwd conversion for extensionless Windows launcher (fixed — use `process.platform === 'win32'` OR `.exe` suffix check)
- [x] P5: Preserve Unix path case in global `isPathAllowed` checks (fixed — skip `.toLowerCase()` for Unix paths in `isPathAllowed`)
- [x] P6: Avoid OS-dependent UNC rejection in Windows tests (fixed — pass `allowedPaths` so validation rejects UNC deterministically)
