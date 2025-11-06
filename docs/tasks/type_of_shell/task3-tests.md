# Task 3: Unit Tests for Shell Type Feature

## Priority

MEDIUM - Ensure reliability of the new feature.

## Description

Add comprehensive unit tests covering configuration loading, validation context creation and path normalization for custom shells defined with the `type` property.

## Scope

- Create tests that load a config containing a "custom-bash" shell with `type: 'unix'` and verify that `getResolvedShellConfig` returns the proper structure.
- Add tests for `createValidationContext` to ensure the flags are set correctly for each shell type.
- Extend existing path validation tests to use a custom shell entry.

## Files to Modify/Create

- `tests/configNormalization.test.ts` (add cases)
- `tests/validation/context.test.ts` (update)
- Potentially new test files for additional path checks.

## Expected Coverage After Implementation

- Overall coverage should remain above current levels.

## Acceptance Criteria

1. All test suites pass with `npm test`.
2. New tests demonstrate functionality of custom shells defined via `type`.
