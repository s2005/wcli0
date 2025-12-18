# Command Execution Header and File Content Tests

These tests verify that log files saved to disk contain a standardized metadata header and follow the correct format.

## Tests Summary

- **`Metadata Header`**:
    - Ensures EVERY log file starts with a standardized header containing:
        - Execution ID
        - Timestamp (ISO format)
        - Shell used
        - Working directory
        - Command executed
        - Exit code
        - Total line count
    - Verifies proper separation between the metadata header and the actual command output.
- **`Correctness`**:
    - Verifies timestamp accuracy (matches execution time).
    - Checks that non-zero exit codes are correctly documented.
    - Ensures special characters and multiline output are handled correctly within the file format.
- **`Resilience`**:
    - Confirms that the metadata header is PRESERVED even if the actual command output is truncated due to file size limits.
