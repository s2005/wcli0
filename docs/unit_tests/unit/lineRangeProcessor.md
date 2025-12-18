# Line Range Processor Tests

These tests verify the `LineRangeProcessor` utility, which extracts specific line ranges from command output.

## Tests Summary

- **`processRange`**:
    - Extracts positive ranges (e.g., lines 1-10).
    - Extracts negative ranges (e.g., -10 to -1, counting from the end).
    - Extracts mixed ranges (e.g., line 10 to -10).
    - Extracts single lines.
    - Handles line number toggling (including or excluding `N: ` prefixes).
- **`validation`**:
    - Rejects invalid start lines (< 1).
    - Rejects end lines exceeding total lines in output.
    - Rejects ranges where start > end.
    - Enforces `maxLines` limit on the requested range.
- **`resolveRange`**:
    - Verifies the internal logic for converting relative indices (negative) to absolute line numbers.
- **`formatting`**:
    - Verifies the header format (e.g., `Lines X-Y of Z:`).
    - Ensures line content is preserved exactly (spacing, tabs, etc.).
- **`edge cases`**:
    - Handles empty lines, single-line output, and very long lines.
    - Supports Unicode characters and CRLF line endings.
