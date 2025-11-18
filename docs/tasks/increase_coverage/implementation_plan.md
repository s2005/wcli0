# Implementation Plan: Increasing Test Coverage

**Date:** November 18, 2025
**Project:** wcli0

## Overview

This plan outlines the steps to implement missing tests for the logging and resource utilities in `src/utils`. The goal is to achieve high coverage for these critical components.

## Phase 1: Core Logging Utilities (High Priority)

These components contain complex logic and are the foundation for the logging system.

### 1.1 `LogStorageManager` Tests

* **Target File:** `src/utils/logStorage.ts`
* **Test File:** `tests/unit/logStorage.test.ts` (Create new file)
* **Test Cases:**
  * **Storage:** Verify logs are stored correctly with generated IDs.
  * **Retrieval:** Verify `getLog`, `hasLog`, and `listLogs` work as expected.
  * **Filtering:** Test `listLogs` with various filters (shell, exitCode, time range).
  * **Truncation:** Verify logs exceeding `maxLogSize` are truncated correctly (stdout, stderr, combined).
  * **Cleanup:**
    * Verify `removeExpiredLogs` removes old logs.
    * Verify `enforceCountLimit` removes oldest logs when count exceeds limit.
    * Verify `enforceStorageLimit` removes oldest logs when size exceeds limit.
  * **Deletion:** Verify `deleteLog` removes entry and updates stats.
  * **Clear:** Verify `clear` removes all logs.

### 1.2 `SearchProcessor` Tests

* **Target File:** `src/utils/searchProcessor.ts`
* **Test File:** `tests/unit/searchProcessor.test.ts` (Create new file)
* **Test Cases:**
  * **Basic Search:** Find simple string matches.
  * **Regex Search:** Find matches using regex patterns.
  * **Case Sensitivity:** Test case-sensitive and case-insensitive searches.
  * **Context:** Verify `before` and `after` context lines are extracted correctly.
  * **Occurrences:**
    * Verify specific occurrence retrieval.
    * Verify error when occurrence is out of range.
  * **Formatting:** Check the output format of the search result.
  * **Errors:** Verify handling of invalid regex patterns.

### 1.3 `LineRangeProcessor` Tests

* **Target File:** `src/utils/lineRangeProcessor.ts`
* **Test File:** `tests/unit/lineRangeProcessor.test.ts` (Create new file)
* **Test Cases:**
  * **Positive Indices:** Extract range using standard 1-based indices.
  * **Negative Indices:** Extract range using negative indices (e.g., -1 for last line).
  * **Mixed Indices:** Combine positive and negative indices.
  * **Validation:**
    * Error if start < 1.
    * Error if end > total lines.
    * Error if start > end.
  * **Limits:** Verify `maxLines` limit is enforced.
  * **Formatting:** Check output with and without line numbers.

## Phase 2: Resource Handling (Medium Priority)

### 2.1 `LogResourceHandler` Tests

* **Target File:** `src/utils/logResourceHandler.ts`
* **Test File:** `tests/unit/logResourceHandler.test.ts` (Create new file)
* **Test Cases:**
  * **URI Parsing:**
    * Valid URIs (`list`, `recent`, `full`, `range`, `search`).
    * Invalid URIs (wrong protocol, unknown resource).
  * **Dispatch:** Verify correct handler methods are called based on URI.
  * **List:** Verify `handleListResource` returns correct JSON structure.
  * **Recent:** Verify `handleRecentResource` respects `n` and `shell` parameters.
  * **Full Log:** Verify `handleFullLogResource` returns log content or 404.
  * **Range:** Verify `handleRangeResource` parses params and calls `LineRangeProcessor`.
  * **Search:** Verify `handleSearchResource` parses params and calls `SearchProcessor`.

## Phase 3: Helper Utilities (Low Priority)

### 3.1 `Truncation` Tests

* **Target File:** `src/utils/truncation.ts`
* **Test File:** `tests/unit/truncation.test.ts` (Create new file)
* **Test Cases:**
  * **No Truncation:** Output shorter than limit is unchanged.
  * **Truncation:** Output longer than limit is truncated to last N lines.
  * **Message:** Verify truncation message format and variable replacement.

### 3.2 `ValidationContext` Tests

* **Target File:** `src/utils/validationContext.ts`
* **Test File:** `tests/unit/validationContext.test.ts` (Create new file)
* **Test Cases:**
  * **Context Creation:** Verify `isWindowsShell`, `isUnixShell`, `isWslShell` flags are set correctly for different shell types.
  * **Path Format:** Verify `getExpectedPathFormat` returns correct format for context.

## Execution Strategy

1. Create `tests/unit` directory if it doesn't exist.
2. Implement Phase 1 tests sequentially.
3. Run tests after each implementation to ensure correctness.
4. Implement Phase 2 tests.
5. Implement Phase 3 tests.
6. Run full test suite to ensure no regressions.
