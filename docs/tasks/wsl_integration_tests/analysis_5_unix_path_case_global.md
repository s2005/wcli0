# Analysis 5 - Preserve Unix path case in global allow checks

## Decision: Valid — fix applied

`isPathAllowed` unconditionally lowercases both the test path and the allowed path, which defeats the case-preservation work in `normalizeAllowedPaths` for Unix paths. Since Unix filesystems are case-sensitive, `/tmp/MyApp` and `/tmp/myapp` are different directories. The fix skips `.toLowerCase()` for paths that start with `/` (Unix-style), making global allow checks case-sensitive for Unix paths while remaining case-insensitive for Windows paths.

**Why:** The `normalizeAllowedPaths` function already preserves case for Unix paths (see `src/utils/validation.ts:428-429`), but `isPathAllowed` lowercases everything, making the preservation useless for global checks like startup CWD validation and `set_current_directory`.

**Commit:** 8d7c451 — fix(validation): address review feedback round 2 for PR #82
