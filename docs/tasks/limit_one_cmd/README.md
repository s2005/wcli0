# Task: Per-Command Output Limit Configuration

## Overview

Implement support for per-command `maxOutputLines` configuration, allowing individual commands to override the global output limit setting.

**Status**: 📋 Planning Phase
**Priority**: Medium
**Estimated Effort**: 7-10 hours
**Target Version**: 1.1.0

## Problem Statement

Currently, all shell commands share a single global `maxOutputLines` configuration (default: 20 lines). This creates limitations:

- Build and test commands often need more output lines
- Simple commands (ls, pwd) don't need many lines
- Users must change global config frequently or accept suboptimal limits
- No way to customize output on a per-command basis

## Proposed Solution

Add an optional `maxOutputLines` parameter to the `execute_command` tool, allowing commands to specify their own output limit that overrides the global setting.

```json
{
  "tool": "execute_command",
  "input": {
    "command": "npm test",
    "maxOutputLines": 100
  }
}
```

## Documentation

This task includes three planning documents:

### 1. [Implementation Plan](./implementation-plan.md)
- High-level overview of changes
- Step-by-step implementation guide
- Usage examples
- Backward compatibility considerations
- Files to modify

**Read this first** for a general understanding of what needs to be done.

### 2. [Technical Specification](./technical-spec.md)
- Detailed technical requirements
- Architecture diagrams
- Data flow and precedence logic
- Interface changes
- Validation rules
- Security considerations
- Error handling

**Read this** when implementing to understand the detailed requirements.

### 3. [Test Plan](./test-plan.md)
- Comprehensive test scenarios
- Unit, integration, and performance tests
- Edge cases and regression tests
- Coverage requirements (>95%)
- Manual testing checklist

**Read this** when writing tests to ensure complete coverage.

## Key Design Decisions

### Parameter Precedence
```
Command-level maxOutputLines → Global config → Default (20)
```

### Validation
- Type: Positive integer
- Range: 1 to 10,000
- Invalid values throw descriptive errors

### Backward Compatibility
- ✅ Fully backward compatible
- ✅ No breaking changes
- ✅ Existing code works without modifications

### Interaction with Global Settings
- Global `enableTruncation=false` disables all truncation (command-level parameter ignored)
- Command-level parameter only affects line count, not whether truncation is enabled

## Implementation Checklist

### Phase 1: Core Implementation
- [ ] Update `ExecuteCommandArgs` interface
- [ ] Modify `executeShellCommand` method signature
- [ ] Implement precedence resolution logic
- [ ] Update truncation application
- [ ] Update tool handler

### Phase 2: Tool Definition
- [ ] Update `execute_command` tool schema
- [ ] Add parameter validation

### Phase 3: Testing
- [ ] Unit tests for precedence
- [ ] Unit tests for validation
- [ ] Integration tests
- [ ] Performance tests
- [ ] Edge case tests
- [ ] Regression tests

### Phase 4: Documentation
- [ ] Update README.md
- [ ] Update API documentation
- [ ] Add usage examples
- [ ] Update configuration guide

## Quick Start for Developers

### 1. Read the Plans
```bash
# Start here
cat docs/tasks/limit_one_cmd/implementation-plan.md

# Then review technical details
cat docs/tasks/limit_one_cmd/technical-spec.md

# Finally, review testing
cat docs/tasks/limit_one_cmd/test-plan.md
```

### 2. Review Current Implementation
```bash
# See how output limiting currently works
git grep -n "maxOutputLines" src/
git grep -n "truncateOutput" src/
```

Key files:
- `src/index.ts:302-451` - executeShellCommand method
- `src/utils/truncation.ts` - truncation logic
- `src/types/config.ts` - type definitions
- `src/utils/config.ts` - default config

### 3. Create Feature Branch
```bash
git checkout -b feature/per-command-output-limit
```

### 4. Implement Core Changes
Start with Phase 1 from the implementation plan:

```typescript
// 1. Update types (src/types/config.ts)
export interface ExecuteCommandArgs {
  command: string;
  timeout?: number;
  workingDirectory?: string;
  maxOutputLines?: number;  // NEW
}

// 2. Update executeShellCommand signature
private async executeShellCommand(
  command: string,
  timeout?: number,
  workingDirectory?: string,
  maxOutputLines?: number  // NEW
): Promise<ExecuteCommandResult>

// 3. Add precedence resolution
const effectiveMaxOutputLines =
  maxOutputLines ??
  this.config.global.logging?.maxOutputLines ??
  20;

// 4. Use in truncation
truncateOutput(fullOutput, effectiveMaxOutputLines, {...})
```

### 5. Write Tests
Follow test plan for comprehensive coverage:

```bash
# Run tests as you implement
npm test -- --watch --testPathPattern=truncation

# Check coverage
npm test -- --coverage
```

### 6. Update Documentation
- Update README.md with new parameter
- Add examples
- Update tool documentation

### 7. Verify and Submit
```bash
# Run all tests
npm test

# Check types
npm run type-check

# Lint
npm run lint

# Build
npm run build

# Create PR
git commit -m "feat: add per-command maxOutputLines parameter"
git push origin feature/per-command-output-limit
```

## Example Usage

### Before (Global Config Only)
```typescript
// config.json
{
  "global": {
    "logging": {
      "maxOutputLines": 20  // All commands limited to 20 lines
    }
  }
}

// All commands use 20 lines
await execute({ command: "npm test" });       // 20 lines
await execute({ command: "npm run build" });  // 20 lines
await execute({ command: "ls -la" });         // 20 lines
```

### After (Per-Command Override)
```typescript
// config.json (same as before)
{
  "global": {
    "logging": {
      "maxOutputLines": 20  // Default for all commands
    }
  }
}

// Commands can override the default
await execute({
  command: "npm test",
  maxOutputLines: 100  // Override: use 100 lines
});

await execute({
  command: "npm run build",
  maxOutputLines: 200  // Override: use 200 lines
});

await execute({
  command: "ls -la"
  // No override: use global default (20 lines)
});
```

## Benefits

### For Users
- ✅ Fine-grained control over output limits
- ✅ No need to change global config frequently
- ✅ Better debugging for verbose commands
- ✅ Cleaner output for simple commands

### For Developers
- ✅ Clear, maintainable implementation
- ✅ Comprehensive test coverage
- ✅ No breaking changes
- ✅ Well-documented behavior

## Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Planning | ✅ Complete | Documentation and design |
| Phase 1 | 2-3 hours | Core implementation |
| Phase 2 | 1 hour | Tool definition updates |
| Phase 3 | 3-4 hours | Comprehensive testing |
| Phase 4 | 1-2 hours | Documentation updates |
| **Total** | **7-10 hours** | End-to-end implementation |

## Success Metrics

- [ ] All tests pass with >95% coverage
- [ ] No performance degradation
- [ ] Backward compatibility verified
- [ ] Documentation complete
- [ ] Code review approved
- [ ] Feature successfully deployed

## Related Issues

- Initial output limiting feature: PR #48 (if exists)
- Log storage implementation: PR #XX (if exists)

## Questions?

If you have questions about this task:

1. Review the three planning documents (implementation, technical spec, test plan)
2. Check existing implementation in `src/index.ts` and `src/utils/truncation.ts`
3. Look at existing tests in `tests/unit/truncation.test.ts`
4. Ask in team chat or create a discussion issue

## Notes

- Full output is always stored in log storage (if enabled)
- This feature only affects immediate response truncation
- Users can always access full logs via `cli://logs/commands/{executionId}`
- Maximum limit (10,000) prevents resource exhaustion
- Global `enableTruncation` setting takes precedence over everything

## References

- [Current truncation implementation](../../src/utils/truncation.ts)
- [executeShellCommand method](../../src/index.ts)
- [LoggingConfig interface](../../src/types/logging.ts)
- [Existing tests](../../tests/unit/truncation.test.ts)
