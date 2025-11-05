/**
 * Performance sanity tests for log feature
 *
 * These tests verify that log operations complete in reasonable time.
 * Thresholds are intentionally generous to avoid flaky CI builds on slower hardware.
 * The goal is to catch severe performance regressions, not to enforce strict benchmarks.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { truncateOutput } from '../../src/utils/truncation.js';
import { LogStorageManager } from '../../src/utils/logStorage.js';
import { LineRangeProcessor } from '../../src/utils/lineRangeProcessor.js';
import { SearchProcessor } from '../../src/utils/searchProcessor.js';
import { LoggingConfig } from '../../src/types/config.js';
import { TruncationConfig } from '../../src/types/logging.js';

// Helper to generate large output
function generateLargeOutput(lines: number): string {
  return Array.from({ length: lines }, (_, i) => {
    const content = `Line ${i + 1}: Sample content with some text to make it realistic`;
    return content;
  }).join('\n');
}

describe('Log Performance Tests', () => {
  let config: LoggingConfig;
  let truncationConfig: TruncationConfig;

  beforeEach(() => {
    config = {
      maxOutputLines: 20,
      enableTruncation: true,
      truncationMessage: '[Output truncated]',
      maxStoredLogs: 50,
      maxLogSize: 1048576,
      maxTotalStorageSize: 52428800,
      enableLogResources: true,
      logRetentionMinutes: 60,
      cleanupIntervalMinutes: 5
    };

    truncationConfig = {
      maxOutputLines: 20,
      enableTruncation: true,
      truncationMessage: '[Output truncated: Showing last {returnedLines} of {totalLines} lines]'
    };
  });

  describe('Truncation Performance', () => {
    test('should truncate 10k lines in reasonable time', () => {
      const largeOutput = generateLargeOutput(10000);

      const start = performance.now();
      truncateOutput(largeOutput, 20, truncationConfig);
      const duration = performance.now() - start;

      // Generous threshold for CI compatibility (typical: 1-5ms on modern hardware)
      expect(duration).toBeLessThan(100);
    });

    test('should truncate 100k lines in reasonable time', () => {
      const largeOutput = generateLargeOutput(100000);

      const start = performance.now();
      truncateOutput(largeOutput, 20, truncationConfig);
      const duration = performance.now() - start;

      // Generous threshold for CI compatibility (typical: 10-30ms on modern hardware)
      expect(duration).toBeLessThan(500);
    });

    test('should handle multiple truncations efficiently', () => {
      const outputs = Array.from({ length: 100 }, (_, i) =>
        generateLargeOutput(1000)
      );

      const start = performance.now();
      outputs.forEach(output => {
        truncateOutput(output, 20, truncationConfig);
      });
      const duration = performance.now() - start;

      // 100 truncations of 1k lines each - generous threshold for CI
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Storage Performance', () => {
    test('should store large log in reasonable time', () => {
      const storage = new LogStorageManager(config);
      const largeOutput = generateLargeOutput(5000);

      const start = performance.now();
      storage.storeLog('test', 'bash', '/', largeOutput, '', 0);
      const duration = performance.now() - start;

      // Generous threshold for CI compatibility (typical: 2-10ms on modern hardware)
      expect(duration).toBeLessThan(500);

      storage.clear();
    });

    test('should handle batch storage efficiently', () => {
      const storage = new LogStorageManager(config);
      const outputs = Array.from({ length: 50 }, (_, i) =>
        generateLargeOutput(100)
      );

      const start = performance.now();
      outputs.forEach((output, i) => {
        storage.storeLog(`cmd${i}`, 'bash', '/', output, '', 0);
      });
      const duration = performance.now() - start;

      // 50 logs of 100 lines each - generous threshold for CI
      expect(duration).toBeLessThan(5000);

      storage.clear();
    });

    test('should retrieve log quickly', () => {
      const storage = new LogStorageManager(config);
      const output = generateLargeOutput(1000);
      const id = storage.storeLog('test', 'bash', '/', output, '', 0);

      const start = performance.now();
      const log = storage.getLog(id);
      const duration = performance.now() - start;

      expect(log).toBeDefined();
      // Hash map lookup should be very fast (typical: <0.1ms)
      expect(duration).toBeLessThan(50);

      storage.clear();
    });

    test('should list logs efficiently', () => {
      const storage = new LogStorageManager(config);

      // Store 50 logs
      for (let i = 0; i < 50; i++) {
        storage.storeLog(`cmd${i}`, 'bash', '/', generateLargeOutput(100), '', 0);
      }

      const start = performance.now();
      const logs = storage.listLogs();
      const duration = performance.now() - start;

      expect(logs.length).toBeGreaterThan(0);
      // Generous threshold for sorting and filtering
      expect(duration).toBeLessThan(100);

      storage.clear();
    });

    test('should cleanup efficiently', () => {
      const storage = new LogStorageManager({
        ...config,
        maxStoredLogs: 10
      });

      // Store more than max to trigger cleanup
      const start = performance.now();
      for (let i = 0; i < 20; i++) {
        storage.storeLog(`cmd${i}`, 'bash', '/', generateLargeOutput(100), '', 0);
      }
      const duration = performance.now() - start;

      expect(storage.getStats().totalLogs).toBe(10);
      // Generous threshold for storage with cleanup
      expect(duration).toBeLessThan(2000);

      storage.clear();
    });
  });

  describe('Range Query Performance', () => {
    test('should process range on 10k lines in reasonable time', () => {
      const largeLog = generateLargeOutput(10000);

      const start = performance.now();
      LineRangeProcessor.processRange(
        largeLog,
        1000,
        2000,
        { lineNumbers: true }
      );
      const duration = performance.now() - start;

      // Generous threshold for CI compatibility (typical: 1-10ms on modern hardware)
      expect(duration).toBeLessThan(500);
    });

    test('should process negative range efficiently', () => {
      const largeLog = generateLargeOutput(10000);

      const start = performance.now();
      LineRangeProcessor.processRange(
        largeLog,
        -100,
        -1,
        { lineNumbers: true }
      );
      const duration = performance.now() - start;

      // Generous threshold for CI compatibility
      expect(duration).toBeLessThan(500);
    });

    test('should handle multiple range queries efficiently', () => {
      const largeLog = generateLargeOutput(10000);

      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        LineRangeProcessor.processRange(
          largeLog,
          i * 100 + 1, // Create non-overlapping 100-line ranges: 1-100, 101-200, etc.
          (i + 1) * 100,
          { lineNumbers: true }
        );
      }
      const duration = performance.now() - start;

      // 10 range queries - generous threshold for CI
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Search Performance', () => {
    test('should search 10k lines in reasonable time', () => {
      const largeLog = generateLargeOutput(10000);

      const start = performance.now();
      SearchProcessor.search(largeLog, {
        pattern: 'Sample',
        contextLines: 3,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });
      const duration = performance.now() - start;

      // Generous threshold for CI compatibility (typical: 3-20ms on modern hardware)
      expect(duration).toBeLessThan(1000);
    });

    test('should count matches efficiently', () => {
      const largeLog = generateLargeOutput(10000);

      const start = performance.now();
      const count = SearchProcessor.countMatches(largeLog, 'Line', false);
      const duration = performance.now() - start;

      expect(count).toBe(10000);
      // Generous threshold for regex matching across 10k lines
      expect(duration).toBeLessThan(1000);
    });

    test('should handle complex regex efficiently', () => {
      const largeLog = generateLargeOutput(10000);

      const start = performance.now();
      SearchProcessor.search(largeLog, {
        pattern: 'Line \\d+: Sample.*realistic',
        contextLines: 2,
        occurrence: 1,
        caseInsensitive: false,
        lineNumbers: true
      });
      const duration = performance.now() - start;

      // Complex regex - generous threshold for CI
      expect(duration).toBeLessThan(1500);
    });

    test('should navigate to last occurrence efficiently', () => {
      const largeLog = generateLargeOutput(10000);
      const count = SearchProcessor.countMatches(largeLog, 'Line', false);

      const start = performance.now();
      SearchProcessor.search(largeLog, {
        pattern: 'Line',
        contextLines: 1,
        occurrence: count, // Last occurrence
        caseInsensitive: false,
        lineNumbers: true
      });
      const duration = performance.now() - start;

      // Finding last occurrence - generous threshold for CI
      expect(duration).toBeLessThan(1500);
    });
  });

  describe('Memory Performance', () => {
    test('should stay within memory bounds during storage', () => {
      const storage = new LogStorageManager(config);
      const initialMemory = process.memoryUsage().heapUsed;

      // Store 50 logs of moderate size
      for (let i = 0; i < 50; i++) {
        const output = generateLargeOutput(1000);
        storage.storeLog(`cmd${i}`, 'bash', '/', output, '', 0);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const increase = finalMemory - initialMemory;

      // Memory increase should be reasonable (< 50MB for this workload)
      expect(increase).toBeLessThan(50 * 1024 * 1024);

      storage.clear();
    });

    test('should cleanup memory when clearing storage', () => {
      const storage = new LogStorageManager(config);

      // Store logs
      for (let i = 0; i < 50; i++) {
        storage.storeLog(`cmd${i}`, 'bash', '/', generateLargeOutput(1000), '', 0);
      }

      const beforeClear = process.memoryUsage().heapUsed;
      storage.clear();

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Give some time for GC
      const afterClear = process.memoryUsage().heapUsed;

      // Storage should be empty
      expect(storage.getStats().totalLogs).toBe(0);
      expect(storage.getStats().totalSize).toBe(0);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent truncations', async () => {
      const outputs = Array.from({ length: 10 }, () =>
        generateLargeOutput(1000)
      );

      const start = performance.now();
      await Promise.all(
        outputs.map(output =>
          Promise.resolve(truncateOutput(output, 20, truncationConfig))
        )
      );
      const duration = performance.now() - start;

      // 10 concurrent operations - generous threshold for CI
      expect(duration).toBeLessThan(500);
    });

    test('should handle concurrent storage operations', async () => {
      const storage = new LogStorageManager(config);
      const outputs = Array.from({ length: 10 }, (_, i) => ({
        cmd: `cmd${i}`,
        output: generateLargeOutput(100)
      }));

      const start = performance.now();
      await Promise.all(
        outputs.map(({ cmd, output }) =>
          Promise.resolve(storage.storeLog(cmd, 'bash', '/', output, '', 0))
        )
      );
      const duration = performance.now() - start;

      // 10 concurrent storage operations - generous threshold for CI
      expect(duration).toBeLessThan(1000);
      storage.clear();
    });
  });
});
