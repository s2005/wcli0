# Path Traversal Protection Tests

These tests verify the security mechanisms in `LogStorageManager` that prevent path traversal attacks via the `logDirectory` configuration.

## Tests Summary

- **`sanitizeLogDirectory - direct traversal patterns`**: 
    - Rejects `..` at the start, middle, and end of the path.
    - Rejects standalone `..`.
    - Rejects Windows-style backslashes `\..\`.
- **`sanitizeLogDirectory - env var expansion attacks`**:
    - Rejects environment variables containing traversal sequences (e.g., `$EVIL_PATH` set to `/../../../etc`).
    - Rejects env vars that are pure traversal `..`.
- **`sanitizeLogDirectory - valid paths`**:
    - Accepts valid absolute Unix and Windows paths.
    - Accepts path with tilde expansion `~/.mcp-logs`.
    - Allows paths containing `..` as part of a directory name (e.g., `my..folder`).
- **`sanitizeLogDirectory - edge cases`**:
    - Handles URL-encoded segments literally (no decoding).
    - Rejects multiple consecutive `..` segments.
    - Handles whitespace in paths correctly.
