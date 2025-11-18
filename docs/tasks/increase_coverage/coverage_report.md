# Test Coverage Report

**Date:** November 18, 2025
**Project:** wcli0

## Executive Summary

The `wcli0` project has a solid foundation of tests, particularly for the core shell implementations and configuration management. However, there is a significant gap in test coverage for the logging and resource retrieval utilities located in `src/utils`. These utilities are critical for the MCP resource functionality (viewing logs, searching logs, etc.).

## Detailed Analysis

### 1. Core & Shells (`src/core`, `src/shells`)

* **Status:** High Coverage
* **Details:**
  * `src/core/registry.ts` is covered by `src/core/__tests__/registry.test.ts`.
  * `src/shells/loader.ts` is covered by `src/shells/__tests__/loader.test.ts`.
  * Base shell classes and implementations (Bash, Cmd, PowerShell, WSL, GitBash) have co-located `__tests__` directories with comprehensive tests.
  * Integration tests in `tests/` (e.g., `wsl.test.ts`, `gitbashWorkingDir.test.ts`) provide additional coverage.

### 2. Configuration & Validation (`src/utils`)

* **Status:** High Coverage
* **Details:**
  * Configuration loading, merging, and validation are well-covered by `tests/config*.test.ts`.
  * `directoryValidator.ts` and `pathValidation.ts` are covered by `tests/directoryValidator.test.ts` and `tests/pathValidation.edge.test.ts`.
  * `toolDescription.ts` is covered by `tests/toolDescription.test.ts`.
  * `validation.ts` is covered by `tests/validation.test.ts`.

### 3. Logging & Resources (`src/utils`)

* **Status:** **Low / Missing Coverage**
* **Details:**
  * The following files have **no direct unit tests**:
    * `src/utils/logStorage.ts`: Manages log lifecycle, truncation, and storage limits.
    * `src/utils/searchProcessor.ts`: Handles regex searching within logs with context.
    * `src/utils/lineRangeProcessor.ts`: Handles extracting line ranges (including negative indices).
    * `src/utils/logResourceHandler.ts`: Parses URIs and orchestrates log retrieval.
    * `src/utils/truncation.ts`: Handles output truncation logic.
    * `src/utils/validationContext.ts`: Helper for shell context.
    * `src/utils/log.ts`: Basic logging wrapper.

## Missing Tests & Risk Assessment

| Component | File | Risk Level | Description |
|-----------|------|------------|-------------|
| **Log Storage** | `src/utils/logStorage.ts` | **High** | Logic for memory management, log rotation, and truncation is complex. Bugs here could lead to memory leaks or data loss. |
| **Search** | `src/utils/searchProcessor.ts` | **High** | Regex handling and context extraction are error-prone. Incorrect implementation could break log search features. |
| **Line Ranges** | `src/utils/lineRangeProcessor.ts` | **High** | Negative index logic and range validation need verification to prevent out-of-bounds errors. |
| **Resource Handler** | `src/utils/logResourceHandler.ts` | **Medium** | URI parsing and error handling need to be robust to handle invalid user requests. |
| **Truncation** | `src/utils/truncation.ts` | **Medium** | Ensures large outputs don't crash the client/server. |
| **Validation Context** | `src/utils/validationContext.ts` | **Low** | Simple logic, but important for correct shell classification. |

## Recommendations

1. **Immediate Action:** Implement unit tests for `LogStorageManager`, `SearchProcessor`, and `LineRangeProcessor`. These contain the most complex logic among the untested files.
2. **Secondary Action:** Implement tests for `LogResourceHandler` to ensure URI parsing and error mapping work as expected.
3. **Final Action:** Add tests for `truncation.ts` and `validationContext.ts` to complete the coverage for `src/utils`.

## Conclusion

Focusing on the logging and resource utilities will significantly improve the reliability of the MCP server's observability features. The existing test infrastructure is good, so adding these new tests should be straightforward.
