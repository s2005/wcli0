# Log Storage Manager Tests

These tests cover the `LogStorageManager` class, which handles in-memory storage of command execution logs.

## Tests Summary

- **`storeLog`**:
    - Verifies storage of log entries with command, shell, working directory, and outputs.
    - Ensures unique IDs are generated for each log.
    - Checks that statistics (stdout/stderr lines) are calculated correctly.
    - Verifies correct combination of output for successful and failed commands.
    - Ensures logs are truncated if they exceed `maxLogSize`.
    - Enforces the `maxStoredLogs` limit using FIFO.
- **`getLog` / `hasLog`**:
    - Verifies retrieval and existence checks of stored logs.
- **`listLogs`**:
    - Verifies listing of all logs.
    - Tests filtering by `shell` and `exitCode`.
    - Ensures logs are sorted by timestamp.
- **`deleteLog` / `clear`**:
    - Verifies deletion of specific logs and clearing the entire storage.
    - Checks that statistics are updated after deletion.
- **`getStats`**:
    - Verifies return of correct storage statistics.
- **`cleanup`**:
    - Enforces log retention policy (removing logs older than `logRetentionMinutes`).
    - Enforces count and total size limits during background cleanup.
- **`lifecycle`**:
    - Verifies starting and stopping the background cleanup timer.
- **`edge cases`**:
    - Handles Unicode characters and special characters in commands/output.
