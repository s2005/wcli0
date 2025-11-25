# Plan Review — Truncation Fallback (2025-11-25)

- **File path disclosure**: Truncation message and tool metadata return absolute `filePath`. This can leak host paths to clients; consider redacting to basename or configurable exposure.
- **Sync FS calls in hot path**: `storeLog` uses `fs.writeFileSync` and `fs.mkdirSync` inside command execution. Under high volume this can block the event loop; prefer async writes or background worker.
- **Undefined `entry` in snippet**: `storeLog` references `entry` before declaration when calling `writeLogToFile`; ensure the log entry object is created before file persistence.
- **Error handling gaps**: `writeLogToFile` / `cleanupOldLogFiles` lack try/catch; a permission or disk error could crash the server. Bubble user-friendly errors and keep service alive.
- **Retention logic**: Uses `mtime` with `setDate` on `Date` (local time). Timezone drift and clock skew could delete fresh logs; consider monotonic age check based on `Date.now() - stats.mtimeMs`.
- **Regex handling in tool**: `new RegExp(args.search)` can throw on invalid patterns; tests call out graceful handling but code path would currently throw. Wrap in try/catch and return a structured error.
- **Resource limits**: `get_command_output` returns full stored output, potentially huge. Need guardrails (max lines/size) or streaming/chunking to avoid blowing memory/response size.
- **Concurrency / cleanup timer**: Optional `setInterval` runs forever without teardown; repeated hot-reloads could accumulate timers. Provide clear lifecycle cleanup.
- **Path normalization**: `ensureLogDirectory` expands `~` but ignores env vars and relative paths; also no normalization against traversal. Sanitize and `path.resolve` before use.
- **Platform newline consistency**: Writing `entry.combinedOutput` as-is may mix `\r\n`/`\n`; consider normalizing to avoid double counting lines in truncation and retrieval.
- **Missing validation**: New config fields lack bounds (e.g., negative `logRetentionDays`, invalid directory strings). Add schema/validation before use.
- **Disk space guardrails**: Plan mentions `maxStoredLogs`/`maxLogSize` but Phase 2 ignores them; risk of unbounded disk growth. Implement limits or document as out-of-scope.
