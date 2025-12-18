# Startup Validation and Config Defaults Tests

These tests ensure that the configuration is validated immediately upon loading and that defaults are correctly handled.

## Tests Summary

- **`Startup Validation`**:
    - Verifies that `loadConfig` throws errors for invalid `maxCommandLength` (must be positive).
    - Verifies that `loadConfig` throws errors for invalid `commandTimeout` (must be >= 1s).
    - Ensures `loadConfig` validates the `logging` configuration (e.g., checking for path traversal in `logDirectory`).
- **`Default Config - logRetentionMinutes`**:
    - Confirms that `logRetentionDays` is NOT set by default, allowing `logRetentionMinutes` to be the primary default.
    - Verifies that user-provided `logRetentionDays` correctly overrides `logRetentionMinutes`.
- **`Default Config - Limit Naming`**:
    - Ensures `maxTotalStorageSize` (in-memory) and `maxTotalLogSize` (on-disk) are handled as distinct concepts.
