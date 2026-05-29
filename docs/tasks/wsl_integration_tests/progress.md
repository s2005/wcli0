# WSL2 Integration Tests — Progress

## Review Feedback (PR #82)

- [x] P1: Preserve Unix root `/` in `normalizeAllowedPaths` (fixed — guard against stripping `/` to `''`; fix nesting/child detection for root path)
- [-] P2: WSL cwd conversion without `.exe` suffix (rejected — `.exe` check is intentional for dual-platform WSL scenario)
- [x] P3: Skip Git Bash tests when unavailable (fixed — replaced `if (!server) return` with `describe.skip`; removed early-return guards)
