# Per-Command Output Limit Configuration

## Overview

Add support for configuring output limits on a per-command basis, allowing individual commands to override the global `maxOutputLines` setting. This enables fine-grained control over output truncation for specific commands that may need more or fewer lines than the global default.

## Current Implementation

### Global Configuration
Currently, output limiting is configured globally in the `LoggingConfig`:

```typescript
// src/types/logging.ts
export interface LoggingConfig {
  maxOutputLines: number;              // Default: 20
  enableTruncation: boolean;            // Default: true
  truncationMessage: string;
  // ... other properties
}
```

All commands use the same `maxOutputLines` value from `config.global.logging.maxOutputLines`.

### Truncation Application
Output truncation is applied in `src/index.ts` (executeShellCommand method, lines 412-422):

```typescript
if (this.config.global.logging?.enableTruncation) {
  const truncated = truncateOutput(
    fullOutput,
    this.config.global.logging.maxOutputLines,  // <-- Global setting
    {
      maxOutputLines: this.config.global.logging.maxOutputLines,
      enableTruncation: true,
      truncationMessage: this.config.global.logging.truncationMessage
    },
    executionId
  );
}
```

## Proposed Changes

### 1. Add Command-Level Configuration

**File**: `src/types/config.ts`

Add new optional parameter to the `execute` tool parameters:

```typescript
export interface ExecuteCommandArgs {
  command: string;
  timeout?: number;
  workingDirectory?: string;
  maxOutputLines?: number;  // NEW: Override global maxOutputLines for this command
}
```

### 2. Update Tool Definition

**File**: `src/index.ts`

Update the `execute_command` tool definition to include the new parameter:

```typescript
{
  name: "execute_command",
  description: "...",
  input_schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Shell command to execute"
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (optional)"
      },
      workingDirectory: {
        type: "string",
        description: "Working directory for command execution (optional)"
      },
      maxOutputLines: {
        type: "number",
        description: "Maximum number of output lines to return (optional, overrides global setting)"
      }
    },
    required: ["command"]
  }
}
```

### 3. Update Command Execution Logic

**File**: `src/index.ts` (executeShellCommand method)

Modify the truncation logic to check for command-level override:

```typescript
private async executeShellCommand(
  command: string,
  timeout?: number,
  workingDirectory?: string,
  maxOutputLines?: number  // NEW parameter
): Promise<ExecuteCommandResult> {

  // ... existing code ...

  // Determine effective maxOutputLines
  const effectiveMaxOutputLines = maxOutputLines ??
                                 this.config.global.logging?.maxOutputLines ??
                                 20;  // fallback to default

  // Apply truncation with effective limit
  if (this.config.global.logging?.enableTruncation) {
    const truncated = truncateOutput(
      fullOutput,
      effectiveMaxOutputLines,  // <-- Use command-level or global setting
      {
        maxOutputLines: effectiveMaxOutputLines,
        enableTruncation: true,
        truncationMessage: this.config.global.logging.truncationMessage
      },
      executionId
    );

    resultMessage = formatTruncatedOutput(truncated);
    wasTruncated = truncated.wasTruncated;
    totalLines = truncated.totalLines;
    returnedLines = truncated.returnedLines;
  }

  // ... rest of existing code ...
}
```

### 4. Update execute_command Tool Handler

**File**: `src/index.ts` (handleToolUse method)

Pass the new parameter through to executeShellCommand:

```typescript
case "execute_command":
  const { command, timeout, workingDirectory, maxOutputLines } = tool.input;
  return await this.executeShellCommand(
    command,
    timeout,
    workingDirectory,
    maxOutputLines  // NEW parameter
  );
```

### 5. Add Validation

**File**: `src/utils/config.ts` or inline in `executeShellCommand`

Add validation for the command-level parameter:

```typescript
// Validate maxOutputLines if provided
if (maxOutputLines !== undefined) {
  if (!Number.isInteger(maxOutputLines) || maxOutputLines < 1) {
    throw new Error(`maxOutputLines must be a positive integer, got: ${maxOutputLines}`);
  }
  if (maxOutputLines > 10000) {
    throw new Error(`maxOutputLines exceeds maximum allowed value (10000), got: ${maxOutputLines}`);
  }
}
```

## Implementation Steps

### Phase 1: Core Implementation
1. ✅ Update `ExecuteCommandArgs` interface in `src/types/config.ts`
2. ✅ Modify `executeShellCommand` method signature to accept `maxOutputLines` parameter
3. ✅ Implement fallback logic: command-level → global → default (20)
4. ✅ Update truncation logic to use effective `maxOutputLines`
5. ✅ Update `execute_command` tool handler to pass the parameter

### Phase 2: Tool Definition
6. ✅ Update `execute_command` tool definition with new parameter
7. ✅ Add validation for `maxOutputLines` parameter

### Phase 3: Testing
8. ✅ Add unit tests for command-level override
9. ✅ Add tests for fallback behavior (undefined → global → default)
10. ✅ Add tests for validation (negative values, zero, extremely large values)
11. ✅ Add integration tests with actual command execution

### Phase 4: Documentation
12. ✅ Update README.md with new parameter usage
13. ✅ Add examples of per-command configuration
14. ✅ Update API documentation

## Usage Examples

### Example 1: Command with Custom Output Limit

```json
{
  "tool": "execute_command",
  "input": {
    "command": "npm test",
    "maxOutputLines": 100
  }
}
```

This command will return up to 100 lines of output, overriding the global default of 20.

### Example 2: Command Using Global Default

```json
{
  "tool": "execute_command",
  "input": {
    "command": "ls -la"
  }
}
```

This command will use the global `maxOutputLines` setting (default: 20).

### Example 3: Command Requesting All Output

```json
{
  "tool": "execute_command",
  "input": {
    "command": "cat small-file.txt",
    "maxOutputLines": 10000
  }
}
```

This command requests a very high limit for small files where full output is desired.

## Backward Compatibility

✅ **Fully backward compatible**: The new parameter is optional. Existing code and configurations will continue to work without any changes.

- If `maxOutputLines` is not provided → uses global setting
- If global setting is not configured → uses default (20)
- No breaking changes to existing APIs or interfaces

## Configuration Precedence

The precedence order for determining the effective `maxOutputLines`:

1. **Command-level parameter** (`maxOutputLines` in tool input) - Highest priority
2. **Global configuration** (`config.global.logging.maxOutputLines`)
3. **Default value** (20) - Fallback

## Edge Cases & Considerations

### 1. Disabling Truncation Per-Command
To effectively disable truncation for a specific command, set a very high value:
```json
{"maxOutputLines": 10000}
```

Note: We don't support setting `maxOutputLines: 0` or `null` to disable truncation, as this could lead to ambiguity with the global `enableTruncation` setting.

### 2. Interaction with Global enableTruncation
- If `config.global.logging.enableTruncation = false`, no truncation occurs regardless of `maxOutputLines`
- The command-level parameter only affects the line limit, not whether truncation is enabled

### 3. Very Large Values
- Maximum allowed value: 10000 lines
- Prevents accidental or intentional resource exhaustion
- Values exceeding this limit will result in validation error

### 4. Log Storage
- Full output is still stored in log storage (if enabled)
- The `maxOutputLines` parameter only affects the immediate response
- Users can always access full output via `cli://logs/commands/{executionId}`

## Testing Strategy

### Unit Tests
- Test parameter precedence (command → global → default)
- Test validation (negative, zero, too large)
- Test truncation behavior with various limits
- Test backward compatibility (undefined parameter)

### Integration Tests
- Execute commands with various `maxOutputLines` values
- Verify truncation messages reflect correct limits
- Verify metadata includes accurate line counts
- Test interaction with global settings

### Performance Tests
- Verify no performance degradation
- Test with very large outputs
- Ensure log storage limits still apply

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/config.ts` | Add `maxOutputLines` to `ExecuteCommandArgs` |
| `src/index.ts` | Update tool definition, handler, and `executeShellCommand` |
| `tests/unit/truncation.test.ts` | Add tests for command-level override |
| `tests/integration/command-execution.test.ts` | Add integration tests |
| `README.md` | Document new parameter |
| `docs/api/tools.md` | Update tool documentation |

## Success Criteria

- ✅ Command-level `maxOutputLines` overrides global setting
- ✅ Falls back to global setting when not specified
- ✅ Validation prevents invalid values
- ✅ Backward compatible with existing code
- ✅ All tests pass
- ✅ Documentation is complete and clear
- ✅ No performance regression

## Future Enhancements

Potential future improvements (out of scope for this task):

1. **Per-command truncation mode**: Support showing first N lines, last N lines, or both
2. **Command-level truncation toggle**: Allow disabling truncation for specific commands
3. **Pattern-based configuration**: Configure limits based on command patterns (e.g., all `npm *` commands use 50 lines)
4. **Adaptive limits**: Automatically adjust limits based on output characteristics
5. **Configuration profiles**: Define named profiles with different truncation settings

## Timeline Estimate

- Phase 1 (Core Implementation): 2-3 hours
- Phase 2 (Tool Definition): 1 hour
- Phase 3 (Testing): 3-4 hours
- Phase 4 (Documentation): 1-2 hours

**Total**: 7-10 hours

## References

- Current implementation: `src/index.ts:302-451` (executeShellCommand)
- Truncation logic: `src/utils/truncation.ts`
- Type definitions: `src/types/config.ts`, `src/types/logging.ts`
- Configuration: `src/utils/config.ts:14-24` (defaults)
- Tests: `tests/unit/truncation.test.ts`
