/**
 * Unit tests for LogStorageManager
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { LogStorageManager } from '../../src/utils/logStorage.js';
import { LoggingConfig } from '../../src/types/config.js';

describe('LogStorageManager', () => {
  let storage: LogStorageManager;
  let config: LoggingConfig;

  beforeEach(() => {
    config = {
      maxOutputLines: 20,
      enableTruncation: true,
      truncationMessage: '[Output truncated]',
      maxStoredLogs: 10,
      maxLogSize: 1024,
      maxTotalStorageSize: 10240,
      enableLogResources: true,
      logRetentionMinutes: 60,
      cleanupIntervalMinutes: 5
    };
    storage = new LogStorageManager(config);
  });

  afterEach(() => {
    storage.stopCleanup();
    storage.clear();
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
      expect(log?.shell).toBe('bash');
      expect(log?.workingDirectory).toBe('/home/user');
      expect(log?.exitCode).toBe(0);
    });

    test('should generate unique IDs', () => {
      const id1 = storage.storeLog('cmd1', 'bash', '/', 'out1', '', 0);
      const id2 = storage.storeLog('cmd2', 'bash', '/', 'out2', '', 0);

      expect(id1).not.toBe(id2);
    });

    test('should calculate statistics correctly', () => {
      const id = storage.storeLog(
        'ls',
        'bash',
        '/',
        'line1\nline2\nline3',
        'error',
        0
      );

      const log = storage.getLog(id);
      expect(log?.stdoutLines).toBe(3);
      expect(log?.stderrLines).toBe(1);
      expect(log?.totalLines).toBeGreaterThan(0);
    });

    test('should combine output correctly for successful command', () => {
      const id = storage.storeLog(
        'echo test',
        'bash',
        '/',
        'test output',
        '',
        0
      );

      const log = storage.getLog(id);
      expect(log?.combinedOutput).toBe('test output');
    });

    test('should combine output correctly for failed command', () => {
      const id = storage.storeLog(
        'bad command',
        'bash',
        '/',
        'some output',
        'error message',
        1
      );

      const log = storage.getLog(id);
      expect(log?.combinedOutput).toContain('Command failed with exit code 1');
      expect(log?.combinedOutput).toContain('error message');
      expect(log?.combinedOutput).toContain('some output');
    });

    test('should truncate oversized logs', () => {
      const largeOutput = 'x'.repeat(2000); // Exceeds 1024 limit
      const id = storage.storeLog('cmd', 'bash', '/', largeOutput, '', 0);

      const log = storage.getLog(id);
      expect(log?.size).toBeLessThanOrEqual(config.maxLogSize);
    });

    test('should enforce max log count (FIFO)', () => {
      const ids: string[] = [];

      // Store more than maxStoredLogs
      for (let i = 0; i < 15; i++) {
        const id = storage.storeLog(`cmd${i}`, 'bash', '/', `out${i}`, '', 0);
        ids.push(id);
      }

      const logs = storage.listLogs();
      expect(logs.length).toBeLessThanOrEqual(config.maxStoredLogs);

      // First entries should be removed
      expect(storage.getLog(ids[0])).toBeUndefined();
      expect(storage.getLog(ids[1])).toBeUndefined();

      // Recent entries should still exist
      expect(storage.getLog(ids[14])).toBeDefined();
    });

    test('should handle empty stdout and stderr', () => {
      const id = storage.storeLog('cmd', 'bash', '/', '', '', 0);

      const log = storage.getLog(id);
      expect(log).toBeDefined();
      expect(log?.stdout).toBe('');
      expect(log?.stderr).toBe('');
    });

    test('should store timestamp', () => {
      const beforeStore = new Date();
      const id = storage.storeLog('cmd', 'bash', '/', 'out', '', 0);
      const afterStore = new Date();

      const log = storage.getLog(id);
      expect(log?.timestamp).toBeDefined();
      expect(log!.timestamp.getTime()).toBeGreaterThanOrEqual(beforeStore.getTime());
      expect(log!.timestamp.getTime()).toBeLessThanOrEqual(afterStore.getTime());
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

  describe('hasLog', () => {
    test('should return true for existing log', () => {
      const id = storage.storeLog('cmd', 'bash', '/', 'out', '', 0);
      expect(storage.hasLog(id)).toBe(true);
    });

    test('should return false for non-existent log', () => {
      expect(storage.hasLog('non-existent')).toBe(false);
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

    test('should filter by shell and exit code', () => {
      const logs = storage.listLogs({ shell: 'bash', exitCode: 0 });
      expect(logs.length).toBe(2);
      expect(logs.every(l => l.shell === 'bash' && l.exitCode === 0)).toBe(true);
    });

    test('should sort by timestamp ascending', () => {
      const logs = storage.listLogs();
      for (let i = 0; i < logs.length - 1; i++) {
        expect(logs[i].timestamp.getTime()).toBeLessThanOrEqual(logs[i + 1].timestamp.getTime());
      }
    });

    test('should return empty array when no logs match filter', () => {
      const logs = storage.listLogs({ shell: 'nonexistent' });
      expect(logs.length).toBe(0);
    });
  });

  describe('deleteLog', () => {
    test('should delete existing log', () => {
      const id = storage.storeLog('cmd', 'bash', '/', 'out', '', 0);

      const deleted = storage.deleteLog(id);
      expect(deleted).toBe(true);
      expect(storage.getLog(id)).toBeUndefined();
    });

    test('should return false when deleting non-existent log', () => {
      const deleted = storage.deleteLog('non-existent');
      expect(deleted).toBe(false);
    });

    test('should update storage stats after deletion', () => {
      const id = storage.storeLog('cmd', 'bash', '/', 'output', '', 0);
      const statsBefore = storage.getStats();

      storage.deleteLog(id);
      const statsAfter = storage.getStats();

      expect(statsAfter.totalLogs).toBe(statsBefore.totalLogs - 1);
      expect(statsAfter.totalSize).toBeLessThan(statsBefore.totalSize);
    });
  });

  describe('clear', () => {
    test('should clear all logs', () => {
      storage.storeLog('cmd1', 'bash', '/', 'out1', '', 0);
      storage.storeLog('cmd2', 'bash', '/', 'out2', '', 0);

      storage.clear();

      expect(storage.listLogs().length).toBe(0);
      const stats = storage.getStats();
      expect(stats.totalLogs).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('getStats', () => {
    test('should return correct statistics', () => {
      storage.storeLog('cmd1', 'bash', '/', 'out1', '', 0);
      storage.storeLog('cmd2', 'bash', '/', 'out2', '', 0);

      const stats = storage.getStats();
      expect(stats.totalLogs).toBe(2);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.maxLogs).toBe(config.maxStoredLogs);
      expect(stats.maxSize).toBe(config.maxTotalStorageSize);
    });

    test('should return zero stats when empty', () => {
      const stats = storage.getStats();
      expect(stats.totalLogs).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('cleanup', () => {
    test('should remove expired logs', () => {
      jest.useFakeTimers();

      const id = storage.storeLog('cmd', 'bash', '/', 'out', '', 0);
      expect(storage.getLog(id)).toBeDefined();

      // Advance time past retention period
      jest.advanceTimersByTime((config.logRetentionMinutes + 1) * 60 * 1000);

      // Trigger cleanup manually by storing a new log
      storage.storeLog('cmd2', 'bash', '/', 'out2', '', 0);

      expect(storage.getLog(id)).toBeUndefined();

      jest.useRealTimers();
    });

    test('should enforce count limit', () => {
      const ids: string[] = [];
      for (let i = 0; i < config.maxStoredLogs + 5; i++) {
        const id = storage.storeLog(`cmd${i}`, 'bash', '/', `out${i}`, '', 0);
        ids.push(id);
      }

      const stats = storage.getStats();
      expect(stats.totalLogs).toBeLessThanOrEqual(config.maxStoredLogs);

      // Oldest should be gone
      expect(storage.getLog(ids[0])).toBeUndefined();
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

      // Spy on the cleanup by checking if expired logs are removed
      const id1 = storage.storeLog('cmd1', 'bash', '/', 'out1', '', 0);

      storage.startCleanup();

      // Advance time past retention
      jest.advanceTimersByTime((config.logRetentionMinutes + 1) * 60 * 1000);

      // Advance time to trigger cleanup interval
      jest.advanceTimersByTime(config.cleanupIntervalMinutes * 60 * 1000);

      // Verify cleanup happened
      expect(storage.getLog(id1)).toBeUndefined();

      storage.stopCleanup();

      jest.useRealTimers();
    });

    test('should not start cleanup twice', () => {
      storage.startCleanup();
      storage.startCleanup(); // Should not throw or create duplicate timers
      storage.stopCleanup();
    });

    test('should handle stop without start', () => {
      storage.stopCleanup(); // Should not throw
    });
  });

  describe('edge cases', () => {
    test('should handle very large number of small logs', () => {
      for (let i = 0; i < 100; i++) {
        storage.storeLog(`cmd${i}`, 'bash', '/', 'x', '', 0);
      }

      const stats = storage.getStats();
      expect(stats.totalLogs).toBeLessThanOrEqual(config.maxStoredLogs);
    });

    test('should handle Unicode characters in output', () => {
      const unicodeOutput = '日本語 🚀 emoji';
      const id = storage.storeLog('cmd', 'bash', '/', unicodeOutput, '', 0);

      const log = storage.getLog(id);
      expect(log?.stdout).toBe(unicodeOutput);
    });

    test('should handle special characters in command', () => {
      const specialCmd = 'echo "test" && ls | grep "*.txt"';
      const id = storage.storeLog(specialCmd, 'bash', '/', 'out', '', 0);

      const log = storage.getLog(id);
      expect(log?.command).toBe(specialCmd);
    });

    test('should handle null/undefined values gracefully', () => {
      const id = storage.storeLog('cmd', 'bash', '/', '', '', 0);

      const log = storage.getLog(id);
      expect(log).toBeDefined();
    });
  });
});
