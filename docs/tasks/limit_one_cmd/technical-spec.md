# Per-Command Output Limit - Technical Specification

## Abstract

This document provides technical specifications for implementing per-command output limit configuration in the wcli0 MCP server. The feature allows individual command executions to specify their own `maxOutputLines` parameter, overriding the global configuration.

## Motivation

### Current Limitation
Currently, all commands share a single global `maxOutputLines` configuration (default: 20 lines). This works well for most use cases, but creates challenges:

1. **Verbose commands**: Some commands (like test runs, build processes) naturally produce more output and would benefit from higher limits
2. **Concise commands**: Simple commands (like `ls`, `pwd`) need fewer lines
3. **Context-specific needs**: The same command may need different limits in different contexts
4. **User workflow**: Users must choose between:
   - Changing global config frequently (disruptive)
   - Using suboptimal limits for all commands (inefficient)
   - Manually accessing full logs via resources (extra steps)

### Solution
Allow commands to specify `maxOutputLines` as an optional parameter, enabling fine-grained control while maintaining backward compatibility.

## Requirements

### Functional Requirements

**FR1**: Commands SHALL accept an optional `maxOutputLines` parameter
- Type: positive integer
- Range: 1 to 10,000
- Default: undefined (uses global setting)

**FR2**: Parameter precedence SHALL be:
1. Command-level `maxOutputLines` (if provided)
2. Global `config.global.logging.maxOutputLines` (if configured)
3. Default value (20)

**FR3**: Invalid values SHALL result in descriptive error messages
- Non-integer values → error
- Zero or negative values → error
- Values > 10,000 → error

**FR4**: The feature SHALL be fully backward compatible
- Existing code continues to work without changes
- No changes to global configuration format
- No changes to existing tool behavior when parameter is omitted

**FR5**: Global `enableTruncation` setting SHALL take precedence
- If `enableTruncation = false`, no truncation occurs regardless of `maxOutputLines`
- Command-level parameter only affects line limit, not whether truncation is enabled

### Non-Functional Requirements

**NFR1**: Performance
- Parameter processing SHALL add < 1ms overhead
- No impact on memory usage
- No impact on log storage performance

**NFR2**: Security
- Validate all inputs to prevent resource exhaustion
- Maximum limit (10,000) prevents excessive memory usage
- No new attack vectors introduced

**NFR3**: Maintainability
- Code changes localized to specific areas
- Clear separation of concerns
- Comprehensive test coverage (>90%)

**NFR4**: Usability
- Intuitive parameter naming
- Clear error messages
- Well-documented behavior

## Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ MCP Client (Claude, other AI assistants)               │
└─────────────────────┬───────────────────────────────────┘
                      │
                      │ Tool Call: execute_command
                      │ {
                      │   command: "npm test",
                      │   maxOutputLines: 100  ← NEW PARAMETER
                      │ }
                      ▼
┌─────────────────────────────────────────────────────────┐
│ MCP Server (wcli0)                                      │
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ handleToolUse()                                   │ │
│  │  - Extracts maxOutputLines from tool input       │ │
│  └─────────────────┬─────────────────────────────────┘ │
│                    │                                   │
│                    ▼                                   │
│  ┌───────────────────────────────────────────────────┐ │
│  │ executeShellCommand(cmd, timeout, wd, maxLines)  │ │
│  │  - Validates maxOutputLines                      │ │
│  │  - Determines effective limit:                   │ │
│  │    1. Command parameter (if provided)            │ │
│  │    2. Global config (if set)                     │ │
│  │    3. Default (20)                               │ │
│  └─────────────────┬─────────────────────────────────┘ │
│                    │                                   │
│                    ▼                                   │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Command Execution                                 │ │
│  │  - Runs shell command                            │ │
│  │  - Captures full output                          │ │
│  │  - Stores in log storage (if enabled)            │ │
│  └─────────────────┬─────────────────────────────────┘ │
│                    │                                   │
│                    ▼                                   │
│  ┌───────────────────────────────────────────────────┐ │
│  │ truncateOutput(output, effectiveMaxLines)        │ │
│  │  - Applies line limit using effective value      │ │
│  │  - Generates truncation message                  │ │
│  │  - Returns last N lines                          │ │
│  └─────────────────┬─────────────────────────────────┘ │
│                    │                                   │
│                    ▼                                   │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Response                                          │ │
│  │  - Truncated output                              │ │
│  │  - Metadata (totalLines, returnedLines, etc.)    │ │
│  │  - Link to full log                              │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

```
Input: {command: "npm test", maxOutputLines: 100}
   │
   ├─→ Validation: Is 100 a valid integer between 1-10000? ✓
   │
   ├─→ Precedence Resolution:
   │    - Command level: 100 (provided) ← SELECTED
   │    - Global level: 20
   │    - Default: 20
   │    → effectiveMaxLines = 100
   │
   ├─→ Command Execution:
   │    - Run: npm test
   │    - Capture: 847 lines of output
   │    - Store: Full output in log storage
   │
   ├─→ Truncation:
   │    - Input: 847 lines
   │    - Limit: 100 lines (from effectiveMaxLines)
   │    - Output: Last 100 lines + truncation message
   │
   └─→ Response:
        {
          content: "[Truncation message]\n[Last 100 lines]",
          metadata: {
            totalLines: 847,
            returnedLines: 100,
            wasTruncated: true,
            executionId: "cmd_xyz123"
          }
        }
```

### Interface Changes

#### ExecuteCommandArgs Interface

**Before:**
```typescript
export interface ExecuteCommandArgs {
  command: string;
  timeout?: number;
  workingDirectory?: string;
}
```

**After:**
```typescript
export interface ExecuteCommandArgs {
  command: string;
  timeout?: number;
  workingDirectory?: string;
  maxOutputLines?: number;  // NEW: 1-10000, overrides global setting
}
```

#### executeShellCommand Method Signature

**Before:**
```typescript
private async executeShellCommand(
  command: string,
  timeout?: number,
  workingDirectory?: string
): Promise<ExecuteCommandResult>
```

**After:**
```typescript
private async executeShellCommand(
  command: string,
  timeout?: number,
  workingDirectory?: string,
  maxOutputLines?: number  // NEW parameter
): Promise<ExecuteCommandResult>
```

### Implementation Details

#### 1. Parameter Extraction
```typescript
// src/index.ts - handleToolUse method
case "execute_command": {
  const {
    command,
    timeout,
    workingDirectory,
    maxOutputLines  // NEW: extract parameter
  } = tool.input as ExecuteCommandArgs;

  return await this.executeShellCommand(
    command,
    timeout,
    workingDirectory,
    maxOutputLines  // NEW: pass to execution
  );
}
```

#### 2. Validation Logic
```typescript
// Validate maxOutputLines if provided
if (maxOutputLines !== undefined) {
  // Type check
  if (!Number.isInteger(maxOutputLines)) {
    throw new Error(
      `maxOutputLines must be an integer, got: ${typeof maxOutputLines}`
    );
  }

  // Range check - minimum
  if (maxOutputLines < 1) {
    throw new Error(
      `maxOutputLines must be at least 1, got: ${maxOutputLines}`
    );
  }

  // Range check - maximum
  if (maxOutputLines > 10000) {
    throw new Error(
      `maxOutputLines cannot exceed 10000, got: ${maxOutputLines}`
    );
  }
}
```

#### 3. Precedence Resolution
```typescript
// Determine effective maxOutputLines with fallback chain
const effectiveMaxOutputLines =
  maxOutputLines ??                                    // 1. Command-level
  this.config.global.logging?.maxOutputLines ??       // 2. Global config
  20;                                                 // 3. Default
```

#### 4. Truncation Application
```typescript
// Apply truncation with effective limit
if (this.config.global.logging?.enableTruncation) {
  const truncated = truncateOutput(
    fullOutput,
    effectiveMaxOutputLines,  // Use resolved effective value
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
```

## Testing Strategy

### Unit Tests

#### Test 1: Command-level override
```typescript
test('uses command-level maxOutputLines when provided', () => {
  const output = generateLines(100);
  const truncated = truncateOutput(output, 30, {...config, maxOutputLines: 30});

  expect(truncated.returnedLines).toBe(30);
  expect(truncated.totalLines).toBe(100);
  expect(truncated.wasTruncated).toBe(true);
});
```

#### Test 2: Global fallback
```typescript
test('falls back to global config when command-level not provided', () => {
  const output = generateLines(100);
  const truncated = truncateOutput(output, undefined, {...config, maxOutputLines: 20});

  expect(truncated.returnedLines).toBe(20);
});
```

#### Test 3: Default fallback
```typescript
test('uses default (20) when neither command nor global provided', () => {
  const output = generateLines(100);
  const truncated = truncateOutput(output, undefined, undefined);

  expect(truncated.returnedLines).toBe(20);
});
```

#### Test 4: Validation - negative
```typescript
test('rejects negative maxOutputLines', async () => {
  await expect(
    executeCommand({command: 'echo test', maxOutputLines: -5})
  ).rejects.toThrow('maxOutputLines must be at least 1');
});
```

#### Test 5: Validation - zero
```typescript
test('rejects zero maxOutputLines', async () => {
  await expect(
    executeCommand({command: 'echo test', maxOutputLines: 0})
  ).rejects.toThrow('maxOutputLines must be at least 1');
});
```

#### Test 6: Validation - too large
```typescript
test('rejects maxOutputLines > 10000', async () => {
  await expect(
    executeCommand({command: 'echo test', maxOutputLines: 10001})
  ).rejects.toThrow('maxOutputLines cannot exceed 10000');
});
```

#### Test 7: Validation - non-integer
```typescript
test('rejects non-integer maxOutputLines', async () => {
  await expect(
    executeCommand({command: 'echo test', maxOutputLines: 25.5})
  ).rejects.toThrow('maxOutputLines must be an integer');
});
```

#### Test 8: Interaction with enableTruncation
```typescript
test('respects global enableTruncation=false', async () => {
  config.global.logging.enableTruncation = false;
  const result = await executeCommand({
    command: generateLongOutput(),
    maxOutputLines: 10
  });

  // Should return all lines since truncation is disabled globally
  expect(result.metadata.wasTruncated).toBe(false);
});
```

### Integration Tests

#### Test 9: End-to-end with custom limit
```typescript
test('executes command with custom maxOutputLines', async () => {
  const server = new WCLIServer();
  const result = await server.handleToolUse({
    name: 'execute_command',
    input: {
      command: 'seq 1 200',  // Generates 200 lines
      maxOutputLines: 50
    }
  });

  expect(result.metadata.totalLines).toBe(200);
  expect(result.metadata.returnedLines).toBe(50);
  expect(result.metadata.wasTruncated).toBe(true);
});
```

#### Test 10: Backward compatibility
```typescript
test('works without maxOutputLines parameter', async () => {
  const server = new WCLIServer();
  const result = await server.handleToolUse({
    name: 'execute_command',
    input: {
      command: 'seq 1 100'
    }
    // No maxOutputLines - should use global default
  });

  expect(result.metadata.returnedLines).toBe(20);  // Global default
});
```

### Performance Tests

#### Test 11: No performance degradation
```typescript
test('parameter processing adds minimal overhead', async () => {
  const iterations = 1000;
  const command = 'echo "test"';

  // Baseline: without parameter
  const start1 = performance.now();
  for (let i = 0; i < iterations; i++) {
    await executeCommand({command});
  }
  const baseline = performance.now() - start1;

  // With parameter
  const start2 = performance.now();
  for (let i = 0; i < iterations; i++) {
    await executeCommand({command, maxOutputLines: 50});
  }
  const withParam = performance.now() - start2;

  // Overhead should be < 5%
  expect((withParam - baseline) / baseline).toBeLessThan(0.05);
});
```

## Error Handling

### Error Scenarios

| Scenario | Error Message | HTTP Status |
|----------|--------------|-------------|
| Non-integer value | `maxOutputLines must be an integer, got: {type}` | 400 |
| Zero or negative | `maxOutputLines must be at least 1, got: {value}` | 400 |
| Exceeds maximum | `maxOutputLines cannot exceed 10000, got: {value}` | 400 |
| Non-numeric | `maxOutputLines must be an integer, got: {type}` | 400 |

### Error Response Format
```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "Error: maxOutputLines must be at least 1, got: -5"
  }]
}
```

## Security Considerations

### Resource Exhaustion Prevention
- **Maximum limit (10,000)**: Prevents malicious or accidental requests for unlimited output
- **Integer validation**: Prevents floating-point attacks or NaN
- **Type checking**: Prevents injection of objects or arrays

### Memory Safety
- Truncation happens after execution but before response formatting
- Full output is still subject to log storage limits (1MB per log)
- No change to overall memory consumption patterns

### No New Attack Vectors
- Parameter is purely numeric (no string injection)
- No file system access
- No code execution beyond existing command execution
- No changes to authentication or authorization

## Documentation Requirements

### 1. README.md Updates

Add section on per-command configuration:

```markdown
### Per-Command Output Limits

You can override the global `maxOutputLines` setting for individual commands:

```json
{
  "tool": "execute_command",
  "input": {
    "command": "npm test",
    "maxOutputLines": 100
  }
}
```

This will return up to 100 lines for this specific command, regardless of the global setting.

**Parameter**: `maxOutputLines` (optional)
- Type: integer
- Range: 1 to 10,000
- Default: Uses global `config.global.logging.maxOutputLines` (default: 20)

If omitted, the global configuration is used.
```

### 2. API Documentation

Document the parameter in tool reference:

```markdown
## execute_command

Executes a shell command and returns the output.

### Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| command | string | Yes | The shell command to execute |
| timeout | number | No | Timeout in milliseconds |
| workingDirectory | string | No | Working directory for execution |
| maxOutputLines | number | No | Maximum output lines (1-10000, default: global setting) |

### Examples

Execute with custom output limit:
```json
{
  "command": "npm test",
  "maxOutputLines": 150
}
```
```

### 3. Configuration Guide

Add examples to configuration documentation:

```markdown
### Global vs Per-Command Limits

**Global configuration** (applies to all commands):
```json
{
  "global": {
    "logging": {
      "maxOutputLines": 20
    }
  }
}
```

**Per-command override** (specific command):
```json
{
  "command": "npm run build",
  "maxOutputLines": 200
}
```

The command-level setting takes precedence when provided.
```

## Migration Path

### For Existing Users

**No migration required** - fully backward compatible.

Existing configurations and code continue to work:
- Commands without `maxOutputLines` use global setting
- Global configuration format unchanged
- All existing behavior preserved

### Adoption Path

1. **Initial**: Use global configuration (current behavior)
2. **Experiment**: Try command-level overrides for specific commands
3. **Optimize**: Identify commands that benefit from custom limits
4. **Refine**: Adjust limits based on actual usage patterns

## Success Metrics

### Development Phase
- [ ] All unit tests pass (target: 100% of new code)
- [ ] All integration tests pass
- [ ] Code review approved
- [ ] Documentation complete

### Post-Deployment
- [ ] No increase in error rates
- [ ] No performance degradation
- [ ] Positive user feedback
- [ ] Feature adoption (track usage in telemetry)

## Open Questions

1. **Should we log when command-level override is used?**
   - Proposal: Add debug-level log for visibility
   - Decision: TBD

2. **Should we provide parameter in truncation message?**
   - Current: `[Output truncated: Showing last {returnedLines} of {totalLines} lines]`
   - Enhanced: `[Output truncated: Showing last {returnedLines} of {totalLines} lines (limit: {maxOutputLines})]`
   - Decision: TBD

3. **Should we support disabling truncation per-command?**
   - Options: `maxOutputLines: -1` or `maxOutputLines: null` or separate `enableTruncation` parameter
   - Concern: Interaction with global `enableTruncation` setting
   - Decision: Not in v1, consider for future enhancement

## References

- [Output Limiting Implementation Summary](./implementation-plan.md)
- [truncateOutput function](../../src/utils/truncation.ts)
- [LoggingConfig interface](../../src/types/logging.ts)
- [executeShellCommand method](../../src/index.ts:302-451)
