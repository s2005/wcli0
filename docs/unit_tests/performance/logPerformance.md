# Log Performance Sanity Tests

These tests verify that logging, truncation, storage, and search operations complete in a reasonable amount of time. 

> [!NOTE]
> Thresholds are intentionally generous to avoid flaky CI builds on slower hardware. The goal is to catch severe performance regressions rather than to enforce strict benchmarks.

## Tests Summary

- **`Truncation Performance`**:
    - Verifies truncation of 10k and 100k lines within milliseconds.
    - Ensures multiple sequential truncations are handled efficiently.
- **`Storage Performance`**:
    - Tests storing large logs (5000 lines) and batch storage of many smaller logs.
    - Verifies that log retrieval (ID lookup) and listing (filtering/sorting) are fast.
    - Ensures background cleanup doesn't significantly penalize storage operations.
- **`Range and Search Performance`**:
    - Verifies line range extraction and regex searching on 10k line logs.
    - Tests counting matches and navigating to the last occurrence of a pattern.
- **`Memory Performance`**:
    - Ensures heap usage stays within reasonable bounds when storing many logs.
    - Verifies that clearing the storage effectively releases memory.
- **`Concurrent Operations`**:
    - Tests performance under concurrent load for truncation and storage operations.
