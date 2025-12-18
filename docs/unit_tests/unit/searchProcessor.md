# Search Processor Tests

These tests verify the `SearchProcessor` utility, which provides regex-based searching within command execution logs with context lines.

## Tests Summary

- **`search`**:
    - Finds single and multiple matches for a given pattern.
    - Supports navigating between occurrences of the same pattern.
    - Provides case-insensitive search support.
    - Supports regular expression patterns.
    - Correctly extracts context lines before and after the match.
    - Handles context boundaries at the start and end of the log output.
    - Supports zero context lines (returning only the matched line).
- **`error handling`**:
    - Throws `LogResourceError` with `NO_MATCHES` when no matches are found.
    - Throws `INVALID_OCCURRENCE` when the requested occurrence index is out of range.
    - Throws `INVALID_SEARCH` for invalid regex patterns.
- **`formatting`**:
    - Verifies line number prefixes in the output.
    - Ensures match highlighting with `>>>` and `<<<` markers.
    - Includes navigation hints (e.g., `occurrence=N`) for navigating results.
    - Provides a summary header with the total match count and current occurrence.
- **`countMatches`**:
    - Correctly counts the total number of matches for a pattern in a string.
- **`edge cases`**:
    - Handles empty output, single-line output, Unicode characters, and very long lines.
    - Ensures multiple matches on the same line are treated as a single line-based occurrence.
    - Preserves whitespace and formatting in matched lines.
