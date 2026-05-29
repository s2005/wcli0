# P5 - Preserve Unix path case in global allow checks

`normalizeAllowedPaths` preserves case for Unix paths, but global callers such as startup CWD validation and `set_current_directory` go through `isPathAllowed` (`src/utils/validation.ts:270`), which lowercases both the candidate and allowed path before comparing. An allowed `/tmp/MyApp` still accepts `/tmp/myapp` on Unix, so the case-preservation fix does not protect non-shell-specific permission checks. Unix paths need case-sensitive comparison in `isPathAllowed`.
