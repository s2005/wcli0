# MCP Log Resource Feature - Testing Strategy

## Table of Contents

1. [Overview](#overview)
2. [Testing Levels](#testing-levels)
3. [Unit Tests](#unit-tests)
4. [Integration Tests](#integration-tests)
5. [End-to-End Tests](#end-to-end-tests)
6. [Performance Tests](#performance-tests)
7. [Edge Cases & Error Handling](#edge-cases--error-handling)
8. [Test Data & Fixtures](#test-data--fixtures)
9. [Coverage Goals](#coverage-goals)
10. [Test Execution Plan](#test-execution-plan)

## Overview

This document outlines the comprehensive testing strategy for the MCP log resource feature. The strategy covers multiple testing levels to ensure correctness, performance, and reliability.

**Testing Philosophy**:
- Test-driven development where practical
- High coverage (>85%) for new code
- Focus on edge cases and error conditions
- Performance benchmarks for critical paths
- Integration tests for workflows
- No regressions in existing functionality

## Testing Levels

### Test Pyramid

```
        /\
       /E2E\        End-to-End Tests (5%)
      /------\      - Full workflows
     /        \     - User scenarios
    / Integr. \    Integration Tests (25%)
   /----------  \   - Component interaction
  /              \  - Resource handlers
 /  Unit Tests    \ Unit Tests (70%)
/------------------\ - Individual functions
                     - Pure logic
```

### Coverage Distribution

| Level | Tests | Coverage Target | Execution Time |
|-------|-------|----------------|----------------|
| Unit | ~150 | >90% | <2s |
| Integration | ~50 | >80% | <10s |
| E2E | ~15 | >70% | <30s |
| Performance | ~10 | N/A | <1min |

## Unit Tests

### 1. Truncation Utility (`truncation.ts`)

**File**: `tests/unit/truncation.test.ts`

```typescript
describe('truncateOutput', () => {
  describe('basic functionality', () => {
    test('should not truncate output shorter than limit', () => {
      const output = 'line1\nline2\nline3';
      const result = truncateOutput(output, 10, config);

      expect(result.wasTruncated).toBe(false);
      expect(result.output).toBe(output);
      expect(result.totalLines).toBe(3);
      expect(result.returnedLines).toBe(3);
    });

    test('should truncate output longer than limit', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncateOutput(output, 20, config);

      expect(result.wasTruncated).toBe(true);
      expect(result.totalLines).toBe(100);
      expect(result.returnedLines).toBe(20);
      expect(result.output).toContain('line 81'); // First of last 20
      expect(result.output).toContain('line 100'); // Last line
      expect(result.output).not.toContain('line 1'); // First line not included
    });

    test('should include truncation message', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncateOutput(output, 20, config, 'exec-id-123');

      expect(result.message).toContain('Showing last 20 of 100 lines');
      expect(result.message).toContain('80 lines omitted');
      expect(result.message).toContain('exec-id-123');
    });
  });

  describe('edge cases', () => {
    test('should handle empty output', () => {
      const result = truncateOutput('', 20, config);

      expect(result.wasTruncated).toBe(false);
      expect(result.output).toBe('');
      expect(result.totalLines).toBe(1); // Empty string is 1 line
    });

    test('should handle single line', () => {
      const result = truncateOutput('single line', 20, config);

      expect(result.wasTruncated).toBe(false);
      expect(result.totalLines).toBe(1);
    });

    test('should handle exactly at limit', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncateOutput(output, 20, config);

      expect(result.wasTruncated).toBe(false);
      expect(result.totalLines).toBe(20);
    });

    test('should handle different line endings', () => {
      const output = 'line1\r\nline2\r\nline3';
      const result = truncateOutput(output, 2, config);

      // Should handle CRLF correctly
      expect(result.returnedLines).toBe(2);
    });
  });

  describe('configuration', () => {
    test('should respect custom message template', () => {
      const customConfig = {
        ...config,
        truncationMessage: 'Custom: {returnedLines}/{totalLines}'
      };

      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncateOutput(output, 20, customConfig);

      expect(result.message).toContain('Custom: 20/100');
    });

    test('should handle no execution ID', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
      const output = lines.join('\n');
      const result = truncateOutput(output, 20, config, undefined);

      expect(result.message).toBeDefined();
      // Should not include resource URI when no ID
    });
  });
});

describe('buildTruncationMessage', () => {
  test('should replace placeholders', () => {
    const message = buildTruncationMessage(
      80,
      100,
      20,
      'exec-123',
      '[Showing {returnedLines} of {totalLines}]'
    );

    expect(message).toContain('Showing 20 of 100');
  });

  test('should handle all standard placeholders', () => {
    const message = buildTruncationMessage(80, 100, 20, 'exec-123');

    expect(message).toMatch(/\d+ lines omitted/);
    expect(message).toMatch(/last \d+ of \d+ lines/);
  });
});
```

**Test Count**: ~15 tests
**Estimated Time**: ~0.5s

### 2. Log Storage Manager (`logStorage.ts`)

**File**: `tests/unit/logStorage.test.ts`

```typescript
describe('LogStorageManager', () => {
  let storage: LogStorageManager;
  let config: LoggingConfig;

  beforeEach(() => {
    config = {
      maxStoredLogs: 10,
      maxLogSize: 1024,
      maxTotalStorageSize: 10240,
      logRetentionMinutes: 60,
      // ... other config
    };
    storage = new LogStorageManager(config);
  });

  describe('storeLog', () => {
    test('should store log entry', () => {
      const id = storage.storeLog(
        'ls -la',
        'bash',
        '/home/user',
        'output',
        '',
        0
      );

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');

      const log = storage.getLog(id);
      expect(log).toBeDefined();
      expect(log?.command).toBe('ls -la');
    });

    test('should generate unique IDs', () => {
      const id1 = storage.storeLog('cmd1', 'bash', '/', 'out1', '', 0);
      const id2 = storage.storeLog('cmd2', 'bash', '/', 'out2', '', 0);

      expect(id1).not.toBe(id2);
    });

    test('should calculate statistics', () => {
      const id = storage.storeLog(
        'ls',
        'bash',
        '/',
        'line1\nline2\nline3',
        'error',
        0
      );

      const log = storage.getLog(id);
      expect(log?.totalLines).toBe(4); // 3 stdout + 1 stderr
      expect(log?.stdoutLines).toBe(3);
      expect(log?.stderrLines).toBe(1);
    });

    test('should enforce max log size', () => {
      const largeOutput = 'x'.repeat(2000); // Exceeds 1024 limit
      const id = storage.storeLog('cmd', 'bash', '/', largeOutput, '', 0);

      const log = storage.getLog(id);
      expect(log?.size).toBeLessThanOrEqual(config.maxLogSize);
    });

    test('should enforce max log count', () => {
      // Store more than maxStoredLogs
      for (let i = 0; i < 15; i++) {
        storage.storeLog(`cmd${i}`, 'bash', '/', `out${i}`, '', 0);
      }

      const logs = storage.listLogs();
      expect(logs.length).toBeLessThanOrEqual(config.maxStoredLogs);
    });

    test('should remove oldest entries first', () => {
      const ids: string[] = [];
      for (let i = 0; i < 15; i++) {
        const id = storage.storeLog(`cmd${i}`, 'bash', '/', `out${i}`, '', 0);
        ids.push(id);
      }

      // First entries should be removed
      expect(storage.getLog(ids[0])).toBeUndefined();
      expect(storage.getLog(ids[1])).toBeUndefined();

      // Recent entries should still exist
      expect(storage.getLog(ids[14])).toBeDefined();
    });
  });

  describe('getLog', () => {
    test('should retrieve stored log', () => {
      const id = storage.storeLog('ls', 'bash', '/', 'output', '', 0);
      const log = storage.getLog(id);

      expect(log).toBeDefined();
      expect(log?.id).toBe(id);
      expect(log?.command).toBe('ls');
    });

    test('should return undefined for non-existent log', () => {
      const log = storage.getLog('non-existent-id');
      expect(log).toBeUndefined();
    });
  });

  describe('listLogs', () => {
    beforeEach(() => {
      storage.storeLog('cmd1', 'bash', '/home', 'out1', '', 0);
      storage.storeLog('cmd2', 'powershell', '/home', 'out2', '', 1);
      storage.storeLog('cmd3', 'bash', '/tmp', 'out3', '', 0);
    });

    test('should list all logs', () => {
      const logs = storage.listLogs();
      expect(logs.length).toBe(3);
    });

    test('should filter by shell', () => {
      const logs = storage.listLogs({ shell: 'bash' });
      expect(logs.length).toBe(2);
      expect(logs.every(l => l.shell === 'bash')).toBe(true);
    });

    test('should filter by exit code', () => {
      const logs = storage.listLogs({ exitCode: 0 });
      expect(logs.length).toBe(2);
      expect(logs.every(l => l.exitCode === 0)).toBe(true);
    });

    test('should sort by timestamp descending', () => {
      const logs = storage.listLogs();
      for (let i = 0; i < logs.length - 1; i++) {
        expect(logs[i].timestamp >= logs[i + 1].timestamp).toBe(true);
      }
    });
  });

  describe('cleanup', () => {
    test('should remove expired logs', () => {
      jest.useFakeTimers();

      const id = storage.storeLog('cmd', 'bash', '/', 'out', '', 0);

      // Advance time past retention period
      jest.advanceTimersByTime(config.logRetentionMinutes * 60 * 1000 + 1000);

      storage['cleanup'](); // Call private method for testing

      expect(storage.getLog(id)).toBeUndefined();

      jest.useRealTimers();
    });

    test('should enforce total size limit', () => {
      // Create logs that exceed total size
      const largeOutput = 'x'.repeat(500);
      for (let i = 0; i < 30; i++) {
        storage.storeLog(`cmd${i}`, 'bash', '/', largeOutput, '', 0);
      }

      const stats = storage.getStats();
      expect(stats.totalSize).toBeLessThanOrEqual(config.maxTotalStorageSize);
    });
  });

  describe('lifecycle', () => {
    test('should start and stop cleanup timer', () => {
      jest.useFakeTimers();
      const spy = jest.spyOn(storage as any, 'cleanup');

      storage.startCleanup();

      // Advance time by cleanup interval
      jest.advanceTimersByTime(config.cleanupIntervalMinutes * 60 * 1000);

      expect(spy).toHaveBeenCalled();

      storage.stopCleanup();
      spy.mockClear();

      // Advance time again
      jest.advanceTimersByTime(config.cleanupIntervalMinutes * 60 * 1000);

      expect(spy).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    test('should clear all logs', () => {
      storage.storeLog('cmd1', 'bash', '/', 'out1', '', 0);
      storage.storeLog('cmd2', 'bash', '/', 'out2', '', 0);

      storage.clear();

      expect(storage.listLogs().length).toBe(0);
    });
  });
});
```

**Test Count**: ~25 tests
**Estimated Time**: ~1s

### 3. Line Range Processor (`lineRangeProcessor.ts`)

**File**: `tests/unit/lineRangeProcessor.test.ts`

```typescript
describe('LineRangeProcessor', () => {
  const sampleOutput = Array.from(
    { length: 100 },
    (_, i) => `Line ${i + 1}`
  ).join('\n');

  describe('processRange', () => {
    test('should extract positive range', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        1,
        10,
        { lineNumbers: true }
      );

      expect(result).toContain('Line 1');
      expect(result).toContain('Line 10');
      expect(result).not.toContain('Line 11');
    });

    test('should extract negative range', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        -10,
        -1,
        { lineNumbers: true }
      );

      expect(result).toContain('Line 91');
      expect(result).toContain('Line 100');
      expect(result).not.toContain('Line 90');
    });

    test('should extract mixed range', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        10,
        -10,
        { lineNumbers: true }
      );

      expect(result).toContain('Line 10');
      expect(result).toContain('Line 91');
    });

    test('should include line numbers by default', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        1,
        5,
        { lineNumbers: true }
      );

      expect(result).toMatch(/1: Line 1/);
      expect(result).toMatch(/5: Line 5/);
    });

    test('should exclude line numbers when requested', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        1,
        5,
        { lineNumbers: false }
      );

      expect(result).not.toMatch(/\d+: /);
      expect(result).toContain('Line 1');
    });
  });

  describe('validation', () => {
    test('should reject start line < 1', () => {
      expect(() => {
        LineRangeProcessor.processRange(sampleOutput, 0, 10, { lineNumbers: true });
      }).toThrow('Start line must be >= 1');
    });

    test('should reject end line > total', () => {
      expect(() => {
        LineRangeProcessor.processRange(sampleOutput, 1, 200, { lineNumbers: true });
      }).toThrow('exceeds total lines');
    });

    test('should reject start > end', () => {
      expect(() => {
        LineRangeProcessor.processRange(sampleOutput, 50, 10, { lineNumbers: true });
      }).toThrow('must be <= end line');
    });
  });

  describe('edge cases', () => {
    test('should handle single line', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        5,
        5,
        { lineNumbers: true }
      );

      expect(result).toContain('Line 5');
      expect(result).not.toContain('Line 4');
      expect(result).not.toContain('Line 6');
    });

    test('should handle full range', () => {
      const result = LineRangeProcessor.processRange(
        sampleOutput,
        1,
        100,
        { lineNumbers: true }
      );

      expect(result).toContain('Line 1');
      expect(result).toContain('Line 100');
    });

    test('should handle empty lines', () => {
      const output = 'line1\n\nline3';
      const result = LineRangeProcessor.processRange(
        output,
        1,
        3,
        { lineNumbers: true }
      );

      expect(result).toContain('2: '); // Empty line with number
    });
  });
});
```

**Test Count**: ~15 tests
**Estimated Time**: ~0.5s

### 4. Search Processor (`searchProcessor.ts`)

**File**: `tests/unit/searchProcessor.test.ts`

```typescript
describe('SearchProcessor', () => {
  const sampleLog = `
Line 1: Starting application
Line 2: Loading configuration
Line 3: ERROR: Failed to load config
Line 4: Retrying...
Line 5: SUCCESS: Configuration loaded
Line 6: Starting server
Line 7: Error: Port 8080 already in use
Line 8: Trying port 8081
Line 9: Server started successfully
Line 10: ERROR: Database connection failed
  `.trim();

  describe('search', () => {
    test('should find single match', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'Database',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.totalOccurrences).toBe(1);
      expect(result.matchLineNumber).toBe(10);
      expect(result.matchLine).toContain('Database');
    });

    test('should find multiple matches', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 2,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.totalOccurrences).toBe(2);
      expect(result.matchLineNumber).toBe(3);
    });

    test('should navigate between occurrences', () => {
      const result1 = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      const result2 = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 1,
        occurrence: 2,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result1.matchLineNumber).toBe(3);
      expect(result2.matchLineNumber).toBe(10);
    });

    test('should support case insensitive search', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'error',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: true,
        lineNumbers: true
      });

      expect(result.totalOccurrences).toBe(3); // ERROR + Error
    });

    test('should support regex patterns', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR:.*failed',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: true,
        lineNumbers: true
      });

      expect(result.totalOccurrences).toBeGreaterThan(0);
    });

    test('should extract context lines', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 2,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.beforeContext.length).toBe(2);
      expect(result.afterContext.length).toBe(2);
    });

    test('should handle context at start of file', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'Starting application',
        contextLines: 3,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.beforeContext.length).toBe(0);
      expect(result.afterContext.length).toBeGreaterThan(0);
    });

    test('should handle context at end of file', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'Database',
        contextLines: 3,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.beforeContext.length).toBeGreaterThan(0);
      expect(result.afterContext.length).toBe(0);
    });
  });

  describe('error handling', () => {
    test('should throw on no matches', () => {
      expect(() => {
        SearchProcessor.search(sampleLog, {
          pattern: 'NONEXISTENT',
          contextLines: 2,
          occurrence: 1,
          caseInsensitive: false,
          lineNumbers: true
        });
      }).toThrow('No matches found');
    });

    test('should throw on invalid occurrence', () => {
      expect(() => {
        SearchProcessor.search(sampleLog, {
          pattern: 'ERROR',
          contextLines: 2,
          occurrence: 10,
          caseInsensitive: false,
          lineNumbers: true
        });
      }).toThrow('out of range');
    });

    test('should throw on invalid regex', () => {
      expect(() => {
        SearchProcessor.search(sampleLog, {
          pattern: '[invalid',
          contextLines: 2,
          occurrence: 1,
          caseInsensitive: false,
          lineNumbers: true
        });
      }).toThrow();
    });
  });

  describe('formatting', () => {
    test('should format with line numbers', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.fullOutput).toMatch(/\d+: /);
      expect(result.fullOutput).toContain('>>>');
    });

    test('should format without line numbers', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: false
      });

      expect(result.fullOutput).not.toMatch(/^\d+: /m);
    });

    test('should include navigation hint', () => {
      const result = SearchProcessor.search(sampleLog, {
        pattern: 'ERROR',
        contextLines: 1,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });

      expect(result.fullOutput).toContain('occurrence=2');
    });
  });
});
```

**Test Count**: ~20 tests
**Estimated Time**: ~0.8s

## Integration Tests

### 1. Output Truncation Integration

**File**: `tests/integration/truncation.test.ts`

```typescript
describe('Output Truncation Integration', () => {
  test('should truncate long command output', async () => {
    // Execute command with verbose output
    const result = await executeCommand('generate_long_output.sh');

    expect(result.metadata.wasTruncated).toBe(true);
    expect(result.metadata.returnedLines).toBe(20);
    expect(result.metadata.totalLines).toBeGreaterThan(20);
    expect(result.content[0].text).toContain('Output truncated');
  });

  test('should not truncate short output', async () => {
    const result = await executeCommand('echo "test"');

    expect(result.metadata.wasTruncated).toBe(false);
    expect(result.metadata.totalLines).toBeLessThanOrEqual(20);
  });

  test('should respect configuration', async () => {
    // Test with custom maxOutputLines
    const result = await executeCommandWithConfig(
      'generate_output.sh',
      { logging: { maxOutputLines: 5 } }
    );

    expect(result.metadata.returnedLines).toBe(5);
  });
});
```

### 2. Log Resource Integration

**File**: `tests/integration/logResources.test.ts`

```typescript
describe('Log Resources Integration', () => {
  describe('List and Recent Resources', () => {
    test('should list stored logs', async () => {
      // Execute some commands
      await executeCommand('echo "test1"');
      await executeCommand('echo "test2"');

      // Read list resource
      const list = await readResource('cli://logs/list');
      const data = JSON.parse(list.contents[0].text);

      expect(data.logs.length).toBeGreaterThanOrEqual(2);
      expect(data.totalCount).toBeGreaterThanOrEqual(2);
    });

    test('should get recent logs', async () => {
      const recent = await readResource('cli://logs/recent?n=3');
      const data = JSON.parse(recent.contents[0].text);

      expect(data.logs.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Full Log Resource', () => {
    test('should retrieve full log', async () => {
      const result = await executeCommand('echo "test output"');
      const id = result.metadata.executionId;

      const log = await readResource(`cli://logs/commands/${id}`);

      expect(log.contents[0].text).toContain('test output');
    });

    test('should error on non-existent log', async () => {
      await expect(
        readResource('cli://logs/commands/invalid-id')
      ).rejects.toThrow('not found');
    });
  });

  describe('Range Queries', () => {
    test('should query line range', async () => {
      // Execute command with known output
      const result = await executeCommand('generate_numbered_lines.sh');
      const id = result.metadata.executionId;

      const range = await readResource(
        `cli://logs/commands/${id}/range?start=10&end=20`
      );

      expect(range.contents[0].text).toContain('Line 10');
      expect(range.contents[0].text).toContain('Line 20');
    });

    test('should handle negative indices', async () => {
      const result = await executeCommand('generate_numbered_lines.sh');
      const id = result.metadata.executionId;

      const range = await readResource(
        `cli://logs/commands/${id}/range?start=-5&end=-1`
      );

      expect(range.contents[0].text).toContain('last lines');
    });
  });

  describe('Search Queries', () => {
    test('should search for pattern', async () => {
      const result = await executeCommand('npm test');
      const id = result.metadata.executionId;

      const search = await readResource(
        `cli://logs/commands/${id}/search?q=PASS`
      );

      expect(search.contents[0].text).toContain('occurrence');
      expect(search.contents[0].text).toContain('PASS');
    });

    test('should navigate occurrences', async () => {
      const result = await executeCommand('npm test');
      const id = result.metadata.executionId;

      const first = await readResource(
        `cli://logs/commands/${id}/search?q=test&occurrence=1`
      );
      const second = await readResource(
        `cli://logs/commands/${id}/search?q=test&occurrence=2`
      );

      expect(first.contents[0].text).not.toBe(second.contents[0].text);
    });
  });
});
```

**Test Count**: ~20 tests
**Estimated Time**: ~5s

## End-to-End Tests

### E2E Test Scenarios

**File**: `tests/e2e/logFeature.test.ts`

```typescript
describe('Log Feature E2E', () => {
  test('complete workflow: execute, store, query', async () => {
    // 1. Execute command with long output
    const result = await client.execute_command({
      command: 'npm test --verbose',
      shell: 'bash'
    });

    expect(result.metadata.wasTruncated).toBe(true);
    const executionId = result.metadata.executionId;

    // 2. Verify in list
    const list = await client.read_resource('cli://logs/list');
    const listData = JSON.parse(list.contents[0].text);
    const log = listData.logs.find((l: any) => l.id === executionId);
    expect(log).toBeDefined();

    // 3. Get full output
    const full = await client.read_resource(
      `cli://logs/commands/${executionId}`
    );
    expect(full.contents[0].text.split('\n').length).toBe(
      result.metadata.totalLines
    );

    // 4. Search for failures
    const search = await client.read_resource(
      `cli://logs/commands/${executionId}/search?q=FAIL`
    );
    expect(search.contents[0].text).toContain('occurrence');

    // 5. Get specific range
    const range = await client.read_resource(
      `cli://logs/commands/${executionId}/range?start=-20&end=-1`
    );
    expect(range.contents[0].text).toContain('Lines');
  });

  test('configuration: custom limits', async () => {
    // Test with custom configuration
    const client = createClientWithConfig({
      global: {
        logging: {
          maxOutputLines: 5,
          maxStoredLogs: 3
        }
      }
    });

    // Execute multiple commands
    for (let i = 0; i < 5; i++) {
      await client.execute_command({ command: `echo "test${i}"` });
    }

    // Verify only 3 stored
    const list = await client.read_resource('cli://logs/list');
    const data = JSON.parse(list.contents[0].text);
    expect(data.logs.length).toBe(3);
  });

  test('storage lifecycle: cleanup', async () => {
    jest.useFakeTimers();

    const client = createClientWithConfig({
      global: {
        logging: {
          logRetentionMinutes: 1,
          cleanupIntervalMinutes: 1
        }
      }
    });

    const result = await client.execute_command({ command: 'echo "test"' });
    const id = result.metadata.executionId;

    // Advance time
    jest.advanceTimersByTime(2 * 60 * 1000);

    // Verify log removed
    await expect(
      client.read_resource(`cli://logs/commands/${id}`)
    ).rejects.toThrow('not found');

    jest.useRealTimers();
  });
});
```

**Test Count**: ~10 tests
**Estimated Time**: ~20s

## Performance Tests

**File**: `tests/performance/logPerformance.test.ts`

```typescript
describe('Log Performance', () => {
  test('truncation should be fast', async () => {
    const largeOutput = generateLargeOutput(10000); // 10k lines

    const start = performance.now();
    truncateOutput(largeOutput, 20, config);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(10); // <10ms
  });

  test('storage should handle large logs', async () => {
    const storage = new LogStorageManager(config);
    const largeOutput = generateLargeOutput(5000);

    const start = performance.now();
    storage.storeLog('test', 'bash', '/', largeOutput, '', 0);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50); // <50ms
  });

  test('search should be fast', async () => {
    const largeLog = generateLargeOutput(10000);

    const start = performance.now();
    SearchProcessor.search(largeLog, {
      pattern: 'search-term',
      contextLines: 3,
      occurrence: 1,
      caseInsensitive: false,
      lineNumbers: true
    });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100); // <100ms
  });

  test('range query should be fast', async () => {
    const largeLog = generateLargeOutput(10000);

    const start = performance.now();
    LineRangeProcessor.processRange(largeLog, 1000, 2000, { lineNumbers: true });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50); // <50ms
  });

  test('memory usage should stay bounded', async () => {
    const storage = new LogStorageManager(config);
    const initialMemory = process.memoryUsage().heapUsed;

    // Store many logs
    for (let i = 0; i < 100; i++) {
      const output = generateLargeOutput(1000);
      storage.storeLog(`cmd${i}`, 'bash', '/', output, '', 0);
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const increase = finalMemory - initialMemory;

    // Should stay under 100MB
    expect(increase).toBeLessThan(100 * 1024 * 1024);
  });
});
```

## Edge Cases & Error Handling

### Critical Edge Cases to Test

1. **Empty Output**
   - Command produces no output
   - Only stderr, no stdout
   - Only stdout, no stderr

2. **Line Ending Variations**
   - LF only (`\n`)
   - CRLF (`\r\n`)
   - Mixed line endings

3. **Unicode and Special Characters**
   - Unicode characters in output
   - ANSI color codes
   - Control characters

4. **Boundary Conditions**
   - Exactly at maxOutputLines
   - Exactly at maxStoredLogs
   - Exactly at maxLogSize

5. **Concurrent Access**
   - Multiple commands executing simultaneously
   - Multiple resource queries at once

6. **Invalid Inputs**
   - Malformed URIs
   - Invalid query parameters
   - Invalid regex patterns

## Test Data & Fixtures

### Fixture Files

```typescript
// tests/fixtures/sampleLogs.ts
export const SHORT_LOG = 'Line 1\nLine 2\nLine 3';

export const LONG_LOG = Array.from(
  { length: 1000 },
  (_, i) => `Line ${i + 1}: Sample content`
).join('\n');

export const TEST_OUTPUT_WITH_ERRORS = `
PASS tests/unit/foo.test.ts
FAIL tests/unit/bar.test.ts
  Error: Expected true, got false
PASS tests/unit/baz.test.ts
`;

export const BUILD_OUTPUT = `
Building application...
Compiling TypeScript...
Generated 45 modules
Warning: Unused import in foo.ts
Warning: Deprecated API in bar.ts
ERROR: Type error in baz.ts
Build failed with 1 error and 2 warnings
`;
```

### Mock Generators

```typescript
// tests/helpers/generators.ts
export function generateLargeOutput(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) => `Line ${i + 1}: ${randomContent()}`
  ).join('\n');
}

export function randomContent(): string {
  const words = ['foo', 'bar', 'baz', 'test', 'data'];
  return words[Math.floor(Math.random() * words.length)];
}
```

## Coverage Goals

### Overall Coverage Targets

| Component | Line Coverage | Branch Coverage | Function Coverage |
|-----------|--------------|-----------------|-------------------|
| truncation.ts | >95% | >90% | 100% |
| logStorage.ts | >90% | >85% | 100% |
| lineRangeProcessor.ts | >95% | >90% | 100% |
| searchProcessor.ts | >90% | >85% | 100% |
| logResourceHandler.ts | >85% | >80% | >95% |
| Overall | >85% | >80% | >95% |

### Excluded from Coverage

- Type definitions
- Error message strings
- Debug logging statements

## Test Execution Plan

### Development Phase

```bash
# Run unit tests during development
npm test -- --watch

# Run specific test file
npm test -- truncation.test.ts

# Run with coverage
npm test -- --coverage
```

### Pre-Commit

```bash
# Run all unit tests
npm test

# Must pass with no failures
# Coverage must meet targets
```

### CI/CD Pipeline

```yaml
# .github/workflows/test.yml
- name: Run Tests
  run: |
    npm test -- --coverage --maxWorkers=2
    npm run test:integration
    npm run test:e2e
    npm run test:performance

- name: Check Coverage
  run: |
    npm run test:coverage-check
```

### Performance Benchmarking

```bash
# Run performance tests
npm run test:perf

# Generate performance report
npm run test:perf -- --report
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-05
**Status**: Draft for Review
