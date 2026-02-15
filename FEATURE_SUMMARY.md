# Per-Command Timeout Feature - Implementation Summary

## Overview
Successfully implemented per-command timeout feature for wcli0 MCP server, allowing individual commands to override the global `commandTimeout` setting.

## Changes Made

### 1. Core Implementation (`src/index.ts`)

#### executeShellCommand Method
- Added `timeout?: number` parameter to method signature
- Renamed internal `timeout` variable to `timeoutHandle` for clarity
- Implemented logic to use `effectiveTimeout` (provided timeout or shell default)
- Updated timeout error message to show actual timeout used

#### Tool Schema (_executeTool method)
- Added `timeout` parameter to Zod schema validation
- Implemented comprehensive timeout validation:
  - Must be an integer (rejects floats and other types)
  - Must be at least 1 second (rejects 0 and negative values)
  - Must not exceed 3600 seconds (1 hour)
- Added clear error messages for each validation failure case
- Updated executeShellCommand call to pass timeout parameter

### 2. Tool Schema (`src/utils/toolSchemas.ts`)
- Added `timeout` property to execute_command schema
- Documented timeout as optional number parameter
- Added description: "Command timeout in seconds (optional, overrides global setting). Must be a positive integer between 1 and 3,600 (1 hour)."

### 3. Tool Description (`src/utils/toolDescription.ts`)
- Added "Command Timeout" section to tool description
- Documented timeout parameter behavior:
  - Each shell has a default timeout
  - Use `timeout` parameter to override for specific commands
  - Validation rules (1-3600 seconds)
  - Timeout behavior (command termination)
- Added timeout example to WSL usage examples

### 4. Test Infrastructure (`tests/helpers/TestCLIServer.ts`)
- Updated execute_command tool schema to include timeout parameter
- Updated executeCommand method signature to accept optional timeout parameter
- Ensures test infrastructure matches production implementation

### 5. Comprehensive Test Suite (`tests/timeout.test.ts`)

Created new test file with 16 test cases covering:

#### Tool Schema Tests (2 tests)
- Verifies timeout parameter is included in schema
- Confirms timeout is optional (not in required array)

#### Timeout Validation Tests (5 tests)
- Rejects non-integer timeout values
- Rejects timeout less than 1
- Rejects negative timeout values
- Rejects timeout greater than 3600
- Rejects boundary value of 3601

#### Timeout Parameter Passing Tests (4 tests)
- Confirms timeout is optional (command executes without it)
- Accepts minimum valid timeout (1)
- Accepts maximum valid timeout (3600)
- Accepts common timeout values (10, 30, 60, 120, 300, 600, 1800)

#### Integration Tests (2 tests)
- Accepts both timeout and maxOutputLines together
- Accepts workingDir, timeout, and maxOutputLines together

#### Error Message Tests (3 tests)
- Provides clear error message for non-integer timeout
- Provides clear error message for timeout too small
- Provides clear error message for timeout too large

All tests pass successfully (16/16).

### 6. Documentation Updates

#### README.md
- Updated execute_command tool documentation to include:
  - `maxOutputLines` parameter (previously undocumented)
  - `timeout` parameter with description and constraints

#### CHANGELOG.md
- Added version 1.2.2 entry with:
  - New Features: Per-command timeout
  - Improvements: Tool descriptions and documentation
  - Added: Test coverage and validation

## Technical Details

### Validation Rules
```typescript
if (args.timeout !== undefined) {
  if (!Number.isInteger(args.timeout)) {
    throw new McpError(ErrorCode.InvalidRequest,
      `timeout must be an integer, got: ${typeof args.timeout}`);
  }
  if (args.timeout < 1) {
    throw new McpError(ErrorCode.InvalidRequest,
      `timeout must be at least 1 second, got: ${args.timeout}`);
  }
  if (args.timeout > 3600) {
    throw new McpError(ErrorCode.InvalidRequest,
      `timeout cannot exceed 3600 seconds (1 hour), got: ${args.timeout}`);
  }
}
```

### Timeout Precedence
```typescript
const effectiveTimeout = timeout ?? shellConfig.security.commandTimeout;
```
- Command-level timeout takes precedence
- Falls back to shell-specific timeout if not provided
- Shell-specific timeout falls back to global default

### Example Usage
```json
{
  "shell": "wsl",
  "command": "long-running-command",
  "workingDir": "/home/user",
  "timeout": 120
}
```

## Testing Results

### All Tests Pass
- **Total Test Suites**: 76
- **Passed Tests**: 762
- **Skipped Tests**: 4
- **New Timeout Tests**: 16/16 passed
- **Time**: ~2.2 seconds

### Build Status
✅ TypeScript compilation successful
✅ No build errors or warnings

## Backward Compatibility

- ✅ Fully backward compatible
- ✅ Timeout parameter is optional
- ✅ Existing commands work without changes
- ✅ Global timeout behavior unchanged when parameter not provided

## Files Modified

1. `src/index.ts` - Core implementation
2. `src/utils/toolSchemas.ts` - Schema definition
3. `src/utils/toolDescription.ts` - Documentation generation
4. `tests/helpers/TestCLIServer.ts` - Test infrastructure
5. `tests/timeout.test.ts` - New test suite (NEW)
6. `README.md` - User documentation
7. `CHANGELOG.md` - Version history

## Branch Information

- **Branch**: `feature/per-command-timeout`
- **Base**: `main`
- **Status**: Ready for review and merge

## Next Steps

1. Review changes with team
2. Merge to main branch
3. Update package.json version to 1.2.2
4. Publish to npm (if applicable)
5. Tag release in git

## Notes

- Maximum timeout of 3600 seconds (1 hour) chosen as reasonable upper bound
- Prevents accidental indefinite hangs while allowing for long-running operations
- Clear error messages help users understand validation failures
- Full test coverage ensures robust implementation
