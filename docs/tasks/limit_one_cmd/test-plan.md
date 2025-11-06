# Per-Command Output Limit - Test Plan

## Test Coverage Overview

This document outlines comprehensive testing for the per-command `maxOutputLines` feature.

**Target Coverage**: 95%+ for new code

## Test Categories

### 1. Unit Tests (Low-Level Logic)
### 2. Integration Tests (End-to-End)
### 3. Performance Tests
### 4. Edge Case Tests
### 5. Regression Tests

---

## 1. Unit Tests

Location: `tests/unit/truncation.test.ts`, `tests/unit/command-execution.test.ts`

### 1.1 Parameter Precedence Tests

#### Test: Command-level takes precedence over global
```typescript
describe('maxOutputLines precedence', () => {
  test('command-level overrides global setting', () => {
    const globalConfig = { maxOutputLines: 20 };
    const commandMaxLines = 100;
    const output = generateLines(200);

    const result = truncateOutput(output, commandMaxLines, globalConfig);

    expect(result.returnedLines).toBe(100);
    expect(result.totalLines).toBe(200);
    expect(result.wasTruncated).toBe(true);
  });
});
```

**Expected**: Returns 100 lines (command-level)

#### Test: Global used when command-level not provided
```typescript
test('uses global config when command-level undefined', () => {
  const globalConfig = { maxOutputLines: 30 };
  const output = generateLines(200);

  const result = truncateOutput(output, undefined, globalConfig);

  expect(result.returnedLines).toBe(30);
});
```

**Expected**: Returns 30 lines (global setting)

#### Test: Default used when both undefined
```typescript
test('uses default (20) when both undefined', () => {
  const output = generateLines(200);

  const result = truncateOutput(output, undefined, {});

  expect(result.returnedLines).toBe(20);
});
```

**Expected**: Returns 20 lines (default)

#### Test: Command-level 0 doesn't override
```typescript
test('invalid command-level (0) throws error', () => {
  expect(() => {
    validateMaxOutputLines(0);
  }).toThrow('maxOutputLines must be at least 1');
});
```

**Expected**: Validation error thrown

---

### 1.2 Validation Tests

#### Test: Positive integers accepted
```typescript
describe('maxOutputLines validation', () => {
  test('accepts valid positive integers', () => {
    const validValues = [1, 10, 100, 1000, 10000];

    validValues.forEach(value => {
      expect(() => validateMaxOutputLines(value)).not.toThrow();
    });
  });
});
```

**Expected**: No errors for valid values

#### Test: Negative values rejected
```typescript
test('rejects negative values', () => {
  expect(() => validateMaxOutputLines(-1)).toThrow(
    'maxOutputLines must be at least 1, got: -1'
  );

  expect(() => validateMaxOutputLines(-100)).toThrow(
    'maxOutputLines must be at least 1, got: -100'
  );
});
```

**Expected**: Clear error messages

#### Test: Zero rejected
```typescript
test('rejects zero', () => {
  expect(() => validateMaxOutputLines(0)).toThrow(
    'maxOutputLines must be at least 1, got: 0'
  );
});
```

**Expected**: Error indicating minimum is 1

#### Test: Non-integers rejected
```typescript
test('rejects non-integer values', () => {
  const invalidValues = [1.5, 20.7, Math.PI, NaN, Infinity];

  invalidValues.forEach(value => {
    expect(() => validateMaxOutputLines(value)).toThrow(
      /maxOutputLines must be an integer/
    );
  });
});
```

**Expected**: Type error for all non-integers

#### Test: Exceeding maximum rejected
```typescript
test('rejects values > 10000', () => {
  expect(() => validateMaxOutputLines(10001)).toThrow(
    'maxOutputLines cannot exceed 10000, got: 10001'
  );

  expect(() => validateMaxOutputLines(99999)).toThrow(
    'maxOutputLines cannot exceed 10000, got: 99999'
  );
});
```

**Expected**: Error indicating maximum limit

#### Test: Boundary values (edge of valid range)
```typescript
test('accepts boundary values', () => {
  expect(() => validateMaxOutputLines(1)).not.toThrow();      // Min
  expect(() => validateMaxOutputLines(10000)).not.toThrow();  // Max
});
```

**Expected**: Both boundary values accepted

#### Test: String numbers rejected
```typescript
test('rejects string representations of numbers', () => {
  expect(() => validateMaxOutputLines('50' as any)).toThrow(
    /maxOutputLines must be an integer/
  );
});
```

**Expected**: Type error (should be number, not string)

---

### 1.3 Truncation Behavior Tests

#### Test: No truncation when output fits
```typescript
test('no truncation when output within limit', () => {
  const output = generateLines(10);
  const result = truncateOutput(output, 20, {...config});

  expect(result.wasTruncated).toBe(false);
  expect(result.returnedLines).toBe(10);
  expect(result.totalLines).toBe(10);
  expect(result.output).toBe(output);
});
```

**Expected**: Full output returned, no truncation message

#### Test: Truncation applied when exceeds limit
```typescript
test('truncates when output exceeds limit', () => {
  const output = generateLines(100);
  const result = truncateOutput(output, 30, {...config});

  expect(result.wasTruncated).toBe(true);
  expect(result.returnedLines).toBe(30);
  expect(result.totalLines).toBe(100);
});
```

**Expected**: Last 30 lines returned, truncation message included

#### Test: Returns last N lines (not first N)
```typescript
test('returns last N lines when truncating', () => {
  const lines = [];
  for (let i = 1; i <= 100; i++) {
    lines.push(`Line ${i}`);
  }
  const output = lines.join('\n');

  const result = truncateOutput(output, 10, {...config});
  const returnedLines = result.output.split('\n');

  expect(returnedLines).toContain('Line 100');  // Last line present
  expect(returnedLines).toContain('Line 91');   // 10th from last present
  expect(returnedLines).not.toContain('Line 1'); // First line not present
});
```

**Expected**: Returns lines 91-100 (last 10)

#### Test: Truncation message includes correct counts
```typescript
test('truncation message includes accurate line counts', () => {
  const output = generateLines(847);
  const result = truncateOutput(output, 100, {
    ...config,
    truncationMessage: 'Showing {returnedLines} of {totalLines} lines'
  });

  const formatted = formatTruncatedOutput(result);
  expect(formatted).toContain('Showing 100 of 847 lines');
});
```

**Expected**: Message shows 100/847

---

### 1.4 Interaction with Global Settings

#### Test: Respects global enableTruncation=false
```typescript
test('no truncation when globally disabled', () => {
  const output = generateLines(200);
  const config = {
    enableTruncation: false,
    maxOutputLines: 20
  };

  const result = truncateOutput(output, 50, config);

  expect(result.wasTruncated).toBe(false);
  expect(result.returnedLines).toBe(200);
  expect(result.totalLines).toBe(200);
});
```

**Expected**: Full output returned despite maxOutputLines

#### Test: Uses global truncation message template
```typescript
test('uses global truncation message template', () => {
  const output = generateLines(100);
  const config = {
    enableTruncation: true,
    maxOutputLines: 20,
    truncationMessage: 'Custom: {returnedLines}/{totalLines}'
  };

  const result = truncateOutput(output, 30, config);
  const formatted = formatTruncatedOutput(result);

  expect(formatted).toContain('Custom: 30/100');
});
```

**Expected**: Custom message format applied

---

## 2. Integration Tests

Location: `tests/integration/command-execution.test.ts`

### 2.1 End-to-End Command Execution

#### Test: Execute command with custom maxOutputLines
```typescript
describe('execute_command with maxOutputLines', () => {
  test('executes with custom limit', async () => {
    const server = new WCLIServer();
    const result = await server.handleToolUse({
      name: 'execute_command',
      input: {
        command: 'seq 1 200',
        maxOutputLines: 75
      }
    });

    expect(result.metadata.totalLines).toBe(200);
    expect(result.metadata.returnedLines).toBe(75);
    expect(result.metadata.wasTruncated).toBe(true);
    expect(result.metadata.executionId).toBeDefined();
  });
});
```

**Expected**: Returns 75 lines with metadata

#### Test: Execute without maxOutputLines (uses global)
```typescript
test('uses global default when parameter omitted', async () => {
  const server = new WCLIServer();
  const result = await server.handleToolUse({
    name: 'execute_command',
    input: {
      command: 'seq 1 100'
    }
  });

  // Should use global default (20)
  expect(result.metadata.returnedLines).toBe(20);
});
```

**Expected**: Uses global config (20 lines)

#### Test: Full log accessible via resources
```typescript
test('full output accessible in log resources', async () => {
  const server = new WCLIServer();
  const result = await server.handleToolUse({
    name: 'execute_command',
    input: {
      command: 'seq 1 500',
      maxOutputLines: 10
    }
  });

  const executionId = result.metadata.executionId;
  const logResource = await server.getLogResource(executionId);

  expect(logResource.lines).toBe(500);  // Full output stored
  expect(result.metadata.returnedLines).toBe(10);  // But only 10 returned
});
```

**Expected**: Full log stored, limited output returned

---

### 2.2 Tool Input Validation

#### Test: Invalid maxOutputLines rejected at tool level
```typescript
test('rejects invalid maxOutputLines in tool call', async () => {
  const server = new WCLIServer();

  await expect(
    server.handleToolUse({
      name: 'execute_command',
      input: {
        command: 'echo test',
        maxOutputLines: -10
      }
    })
  ).rejects.toThrow('maxOutputLines must be at least 1');
});
```

**Expected**: Error before command execution

#### Test: Non-numeric maxOutputLines rejected
```typescript
test('rejects non-numeric maxOutputLines', async () => {
  const server = new WCLIServer();

  await expect(
    server.handleToolUse({
      name: 'execute_command',
      input: {
        command: 'echo test',
        maxOutputLines: 'fifty' as any
      }
    })
  ).rejects.toThrow(/maxOutputLines must be an integer/);
});
```

**Expected**: Type validation error

---

### 2.3 Real-World Scenarios

#### Test: npm test with high limit
```typescript
test('npm test with 200 line limit', async () => {
  const server = new WCLIServer();
  const result = await server.handleToolUse({
    name: 'execute_command',
    input: {
      command: 'npm test',
      maxOutputLines: 200,
      timeout: 30000
    }
  });

  expect(result.metadata.returnedLines).toBeLessThanOrEqual(200);
  expect(result.isError).toBe(false);
});
```

**Expected**: Returns up to 200 lines of test output

#### Test: Build command with custom limit
```typescript
test('build command with 300 line limit', async () => {
  const server = new WCLIServer();
  const result = await server.handleToolUse({
    name: 'execute_command',
    input: {
      command: 'npm run build',
      maxOutputLines: 300,
      timeout: 60000
    }
  });

  expect(result.metadata.returnedLines).toBeLessThanOrEqual(300);
});
```

**Expected**: Build output limited to 300 lines

#### Test: Simple command (ls) with default
```typescript
test('ls command uses global default', async () => {
  const server = new WCLIServer();
  const result = await server.handleToolUse({
    name: 'execute_command',
    input: {
      command: 'ls -la'
    }
  });

  // Should fit in default 20 lines (no truncation)
  expect(result.metadata.wasTruncated).toBe(false);
});
```

**Expected**: Full output returned (fits in 20 lines)

---

## 3. Performance Tests

Location: `tests/performance/command-execution.perf.ts`

### 3.1 Overhead Measurement

#### Test: Minimal overhead from parameter
```typescript
describe('performance impact', () => {
  test('parameter processing adds <1ms overhead', async () => {
    const iterations = 100;
    const command = 'echo "test"';

    // Baseline
    const baselineStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await executeCommand({ command });
    }
    const baselineDuration = performance.now() - baselineStart;

    // With parameter
    const paramStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await executeCommand({ command, maxOutputLines: 50 });
    }
    const paramDuration = performance.now() - paramStart;

    const overhead = (paramDuration - baselineDuration) / iterations;
    expect(overhead).toBeLessThan(1);  // <1ms per call
  });
});
```

**Expected**: <1ms overhead per execution

### 3.2 Large Output Handling

#### Test: Performance with 10,000 line limit
```typescript
test('handles maximum limit efficiently', async () => {
  const start = performance.now();

  const result = await executeCommand({
    command: 'seq 1 50000',
    maxOutputLines: 10000
  });

  const duration = performance.now() - start;

  expect(result.metadata.returnedLines).toBe(10000);
  expect(duration).toBeLessThan(5000);  // <5s
});
```

**Expected**: Completes in reasonable time

---

## 4. Edge Case Tests

Location: `tests/edge-cases/output-limit.test.ts`

### 4.1 Boundary Conditions

#### Test: Exactly at limit (no truncation)
```typescript
test('output exactly at limit shows no truncation', () => {
  const output = generateLines(50);
  const result = truncateOutput(output, 50, {...config});

  expect(result.wasTruncated).toBe(false);
  expect(result.returnedLines).toBe(50);
  expect(result.totalLines).toBe(50);
});
```

**Expected**: No truncation for exact match

#### Test: One line over limit
```typescript
test('one line over limit triggers truncation', () => {
  const output = generateLines(51);
  const result = truncateOutput(output, 50, {...config});

  expect(result.wasTruncated).toBe(true);
  expect(result.returnedLines).toBe(50);
  expect(result.totalLines).toBe(51);
});
```

**Expected**: Truncation applied, omits 1 line

### 4.2 Special Characters

#### Test: Output with unicode characters
```typescript
test('handles unicode correctly', () => {
  const output = '🚀\n'.repeat(100);
  const result = truncateOutput(output, 20, {...config});

  expect(result.returnedLines).toBe(20);
  expect(result.output).toContain('🚀');
});
```

**Expected**: Unicode preserved in truncation

#### Test: Output with escape sequences
```typescript
test('handles ANSI escape sequences', () => {
  const output = '\x1b[31mRed text\x1b[0m\n'.repeat(100);
  const result = truncateOutput(output, 30, {...config});

  expect(result.returnedLines).toBe(30);
  expect(result.output).toContain('\x1b[31m');
});
```

**Expected**: ANSI codes preserved

### 4.3 Empty/Minimal Output

#### Test: Empty output
```typescript
test('handles empty output', () => {
  const result = truncateOutput('', 20, {...config});

  expect(result.wasTruncated).toBe(false);
  expect(result.returnedLines).toBe(0);
  expect(result.totalLines).toBe(0);
});
```

**Expected**: No errors, no truncation

#### Test: Single line output
```typescript
test('handles single line output', () => {
  const result = truncateOutput('Single line', 20, {...config});

  expect(result.wasTruncated).toBe(false);
  expect(result.returnedLines).toBe(1);
  expect(result.totalLines).toBe(1);
});
```

**Expected**: Full output returned

---

## 5. Regression Tests

Location: `tests/regression/output-limit.test.ts`

### 5.1 Backward Compatibility

#### Test: Existing code without parameter works
```typescript
test('existing calls without maxOutputLines work', async () => {
  const server = new WCLIServer();

  // Old-style call (no maxOutputLines)
  const result = await server.handleToolUse({
    name: 'execute_command',
    input: {
      command: 'seq 1 100'
    }
  });

  expect(result.metadata.returnedLines).toBe(20);  // Global default
  expect(result.isError).toBe(false);
});
```

**Expected**: Works exactly as before

#### Test: Global config still honored
```typescript
test('global config still works as before', async () => {
  const server = new WCLIServer({
    global: {
      logging: {
        maxOutputLines: 35
      }
    }
  });

  const result = await server.handleToolUse({
    name: 'execute_command',
    input: {
      command: 'seq 1 100'
    }
  });

  expect(result.metadata.returnedLines).toBe(35);
});
```

**Expected**: Global setting applied

### 5.2 Existing Features Unaffected

#### Test: Log storage still works
```typescript
test('log storage unaffected', async () => {
  const server = new WCLIServer();

  const result = await server.handleToolUse({
    name: 'execute_command',
    input: {
      command: 'seq 1 1000',
      maxOutputLines: 10
    }
  });

  const log = await server.getLog(result.metadata.executionId);
  expect(log.stdout.split('\n').length).toBe(1000);  // Full log stored
});
```

**Expected**: Full logs still stored

#### Test: Timeout still works
```typescript
test('timeout unaffected by maxOutputLines', async () => {
  const server = new WCLIServer();

  await expect(
    server.handleToolUse({
      name: 'execute_command',
      input: {
        command: 'sleep 10',
        timeout: 100,
        maxOutputLines: 50
      }
    })
  ).rejects.toThrow(/timeout/i);
});
```

**Expected**: Timeout still enforced

---

## Test Execution

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
# Unit tests only
npm test -- --testPathPattern=unit

# Integration tests only
npm test -- --testPathPattern=integration

# Performance tests only
npm test -- --testPathPattern=performance

# Edge case tests only
npm test -- --testPathPattern=edge-cases

# Regression tests only
npm test -- --testPathPattern=regression
```

### Coverage Report
```bash
npm test -- --coverage
```

Target: >95% coverage for new code

---

## Test Data Generators

Utility functions for test setup:

```typescript
// Generate N lines of output
function generateLines(count: number): string {
  const lines = [];
  for (let i = 1; i <= count; i++) {
    lines.push(`Line ${i}`);
  }
  return lines.join('\n');
}

// Generate output with specific size
function generateOutputOfSize(bytes: number): string {
  return 'x'.repeat(bytes);
}

// Generate realistic command output
function generateTestOutput(): string {
  return `
npm test

> wcli0@1.0.0 test
> jest

PASS tests/unit/truncation.test.ts
  ✓ truncates long output (5ms)
  ✓ preserves short output (2ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
Snapshots:   0 total
Time:        1.234s
Ran all test suites.
  `.trim();
}
```

---

## Test Checklist

Before merging:

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All performance tests pass
- [ ] All edge case tests pass
- [ ] All regression tests pass
- [ ] Code coverage >95%
- [ ] No test timeouts
- [ ] No flaky tests (run 10x to verify)
- [ ] Tests documented with clear descriptions
- [ ] Test data generators are reusable

---

## Continuous Integration

Add to CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Run output limit tests
  run: |
    npm test -- --testPathPattern="output-limit|truncation|command-execution"
    npm test -- --coverage --coverageThreshold="{\"global\":{\"lines\":95}}"
```

Ensure tests run on:
- Every PR
- Every commit to main
- Daily scheduled runs (catch flaky tests)

---

## Manual Testing Checklist

Interactive testing scenarios:

- [ ] Execute long-running command with custom limit
- [ ] Execute same command without limit (compare results)
- [ ] Change global config, verify fallback works
- [ ] Test with various limits (1, 10, 100, 1000, 10000)
- [ ] Verify truncation message accuracy
- [ ] Access full logs via resources
- [ ] Test with real commands (npm test, build, etc.)
- [ ] Test with commands producing unicode output
- [ ] Test with commands producing ANSI colors
- [ ] Test with stderr-heavy commands

---

## Test Success Criteria

✅ **All automated tests pass**
✅ **Coverage >95%**
✅ **No performance degradation**
✅ **Backward compatibility verified**
✅ **Edge cases handled**
✅ **Manual testing complete**
