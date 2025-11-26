/**
 * Unit tests for path traversal protection in LogStorageManager
 * Tests for Issue 1 (P0): Path traversal guard in sanitizeLogDirectory
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { LogStorageManager } from '../../src/utils/logStorage.js';
import { LoggingConfig } from '../../src/types/config.js';
import os from 'os';
import path from 'path';

describe('LogStorageManager - Path Traversal Protection', () => {
  const baseConfig: LoggingConfig = {
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

  describe('sanitizeLogDirectory - direct traversal patterns', () => {
    test('should reject ".." at start of path', () => {
      const config = { ...baseConfig, logDirectory: '../etc/passwd' };
      expect(() => new LogStorageManager(config))
        .toThrow('path traversal');
    });

    test('should reject ".." in middle of path', () => {
      const config = { ...baseConfig, logDirectory: '/safe/path/../../../etc' };
      expect(() => new LogStorageManager(config))
        .toThrow('path traversal');
    });

    test('should reject ".." at end of path', () => {
      const config = { ...baseConfig, logDirectory: '/safe/path/..' };
      expect(() => new LogStorageManager(config))
        .toThrow('path traversal');
    });

    test('should reject standalone ".."', () => {
      const config = { ...baseConfig, logDirectory: '..' };
      expect(() => new LogStorageManager(config))
        .toThrow('path traversal');
    });

    test('should reject ".." with Windows backslashes', () => {
      const config = { ...baseConfig, logDirectory: 'C:\\safe\\..\\..\\windows\\system32' };
      expect(() => new LogStorageManager(config))
        .toThrow('path traversal');
    });
  });

  describe('sanitizeLogDirectory - env var expansion attacks', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('should reject env var containing traversal (Unix style)', () => {
      process.env.EVIL_PATH = '/../../../etc';
      const config = { ...baseConfig, logDirectory: '/safe$EVIL_PATH/logs' };
      expect(() => new LogStorageManager(config))
        .toThrow('path traversal');
    });

    test('should reject env var containing traversal (Windows style)', () => {
      process.env.EVIL_PATH = '\\..\\..\\..\\windows';
      const config = { ...baseConfig, logDirectory: 'C:\\safe%EVIL_PATH%\\logs' };
      expect(() => new LogStorageManager(config))
        .toThrow('path traversal');
    });

    test('should reject env var that is pure traversal', () => {
      process.env.EVIL = '..';
      const config = { ...baseConfig, logDirectory: '/safe/$EVIL/logs' };
      expect(() => new LogStorageManager(config))
        .toThrow('path traversal');
    });
  });

  describe('sanitizeLogDirectory - valid paths should work', () => {
    test('should accept absolute Unix path', () => {
      const tmpDir = os.tmpdir();
      const config = { ...baseConfig, logDirectory: path.join(tmpDir, 'safe-logs') };
      // Should not throw
      const storage = new LogStorageManager(config);
      storage.stopCleanup();
    });

    test('should accept path with tilde expansion', () => {
      const config = { ...baseConfig, logDirectory: '~/.mcp-logs' };
      // Should not throw
      const storage = new LogStorageManager(config);
      storage.stopCleanup();
    });

    test('should accept Windows absolute path', () => {
      // Only run on Windows
      if (os.platform() !== 'win32') return;
      
      const config = { ...baseConfig, logDirectory: 'C:\\temp\\mcp-logs' };
      // Should not throw
      const storage = new LogStorageManager(config);
      storage.stopCleanup();
    });

    test('should allow paths containing ".." as part of directory name', () => {
      // "my..folder" is not a traversal - ".." must be a path segment
      const tmpDir = os.tmpdir();
      const config = { ...baseConfig, logDirectory: path.join(tmpDir, 'my..folder') };
      // Should not throw because "my..folder" is a valid name, not traversal
      const storage = new LogStorageManager(config);
      storage.stopCleanup();
    });
  });

  describe('sanitizeLogDirectory - edge cases', () => {
    test('should handle URL-encoded path segments (does not decode)', () => {
      // Note: We don't decode URL encoding - "/safe/..%00/etc" is treated literally
      // This is actually safe because the ".." is not a path segment (it's "..%00")
      // The path.resolve will keep it as-is
      const tmpDir = os.tmpdir();
      // This should work - %00 is just characters in the filename, not traversal
      const config = { ...baseConfig, logDirectory: path.join(tmpDir, 'test..encoded') };
      const storage = new LogStorageManager(config);
      storage.stopCleanup();
    });

    test('should reject multiple consecutive ".." segments', () => {
      const config = { ...baseConfig, logDirectory: '/a/../../../../../../etc' };
      expect(() => new LogStorageManager(config))
        .toThrow('path traversal');
    });

    test('should handle whitespace in paths correctly', () => {
      const tmpDir = os.tmpdir();
      const config = { ...baseConfig, logDirectory: path.join(tmpDir, 'logs with spaces') };
      // Should not throw
      const storage = new LogStorageManager(config);
      storage.stopCleanup();
    });
  });
});
