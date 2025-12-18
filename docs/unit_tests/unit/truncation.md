# Truncation Utility Tests

These tests verify the `truncateOutput` utility and its helper functions, which manage truncation of large command outputs to prevent overwhelming the user while providing access to full logs.

## Tests Summary

- **`truncateOutput`**:
    - **Basic Functionality**:
        - Leaves short output unchanged.
        - Truncates long output to the last N lines.
        - Includes an informative truncation message with summary statistics and resource links.
    - **Edge Cases**:
        - Handles empty output and single lines safely.
        - Correctly handles output exactly at the limit or just one line over.
        - Processes very long single lines without error.
    - **Configuration**:
        - Respects `enableTruncation=false` to bypass truncation.
        - Supports custom truncation message templates.
- **`buildTruncationMessage`**:
    - Replaces placeholders like `{returnedLines}` and `{totalLines}`.
    - Optionally includes execution IDs and MCP resource links (`cli://logs/commands/...`).
    - Smartly includes file basenames or full paths depending on the `exposeFullPath` setting.
    - Omit links when log resources are disabled.
- **`formatTruncatedOutput`**:
    - Combines the truncation message and the truncated content into a single string.
    - Preserves internal formatting and line endings.
