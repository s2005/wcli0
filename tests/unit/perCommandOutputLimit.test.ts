/**
 * Unit tests for per-command maxOutputLines parameter
 */

import { describe, test, expect } from '@jest/globals';
import { TestCLIServer } from '../helpers/TestCLIServer.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

describe('Per-Command Output Limit', () => {
  describe('Validation', () => {
    test('should accept valid positive integers', async () => {
      const server = new TestCLIServer({
        global: {
          paths: { allowedPaths: [process.cwd()] },
          logging: {
            maxOutputLines: 20,
            enableTruncation: true,
            truncationMessage: '[Output truncated: Showing last {returnedLines} of {totalLines} lines]',
            maxStoredLogs: 100,
            maxLogSize: 1048576,
            maxTotalStorageSize: 10485760,
            enableLogResources: true,
            logRetentionMinutes: 60,
            cleanupIntervalMinutes: 10
          }
        }
      });

      const validValues = [1, 10, 100, 1000, 10000];

      for (const value of validValues) {
        const result = await server.executeCommand({
          shell: 'wsl',
          command: 'echo test',
          maxOutputLines: value
        });
        expect(result.exitCode).toBe(0);
      }
    });

    test('should reject negative values', async () => {
      const server = new TestCLIServer({
        global: { paths: { allowedPaths: [process.cwd()] } }
      });

      await expect(
        server.executeCommand({
          shell: 'wsl',
          command: 'echo test',
          maxOutputLines: -1
        })
      ).rejects.toThrow(/maxOutputLines must be at least 1/);
    });

    test('should reject zero', async () => {
      const server = new TestCLIServer({
        global: { paths: { allowedPaths: [process.cwd()] } }
      });

      await expect(
        server.executeCommand({
          shell: 'wsl',
          command: 'echo test',
          maxOutputLines: 0
        })
      ).rejects.toThrow(/maxOutputLines must be at least 1/);
    });

    test('should reject values exceeding maximum', async () => {
      const server = new TestCLIServer({
        global: { paths: { allowedPaths: [process.cwd()] } }
      });

      await expect(
        server.executeCommand({
          shell: 'wsl',
          command: 'echo test',
          maxOutputLines: 10001
        })
      ).rejects.toThrow(/maxOutputLines cannot exceed 10000/);
    });

    test('should reject non-integer values', async () => {
      const server = new TestCLIServer({
        global: { paths: { allowedPaths: [process.cwd()] } }
      });

      await expect(
        server.executeCommand({
          shell: 'wsl',
          command: 'echo test',
          maxOutputLines: 25.5
        })
      ).rejects.toThrow(/maxOutputLines must be an integer/);
    });

    test('should accept boundary values', async () => {
      const server = new TestCLIServer({
        global: {
          paths: { allowedPaths: [process.cwd()] },
          logging: {
            maxOutputLines: 20,
            enableTruncation: true,
            truncationMessage: '[Output truncated]',
            maxStoredLogs: 100,
            maxLogSize: 1048576,
            maxTotalStorageSize: 10485760,
            enableLogResources: false,
            logRetentionMinutes: 60,
            cleanupIntervalMinutes: 10
          }
        }
      });

      // Test minimum boundary
      const result1 = await server.executeCommand({
        shell: 'wsl',
        command: 'echo test',
        maxOutputLines: 1
      });
      expect(result1.exitCode).toBe(0);

      // Test maximum boundary
      const result2 = await server.executeCommand({
        shell: 'wsl',
        command: 'echo test',
        maxOutputLines: 10000
      });
      expect(result2.exitCode).toBe(0);
    });
  });

  describe('Precedence Resolution', () => {
    test('should use command-level when provided', async () => {
      const server = new TestCLIServer({
        global: {
          paths: { allowedPaths: [process.cwd()] },
          logging: {
            maxOutputLines: 20,
            enableTruncation: true,
            truncationMessage: '[Output truncated: Showing last {returnedLines} of {totalLines} lines]',
            maxStoredLogs: 100,
            maxLogSize: 1048576,
            maxTotalStorageSize: 10485760,
            enableLogResources: false,
            logRetentionMinutes: 60,
            cleanupIntervalMinutes: 10
          }
        }
      });

      // Generate more than 20 lines (global) but less than 50 lines (command-level)
      const command = Array.from({ length: 30 }, (_, i) => `echo "Line ${i + 1}"`).join(' && ');

      const result = await server.executeCommand({
        shell: 'wsl',
        command,
        maxOutputLines: 50
      });

      expect(result.exitCode).toBe(0);
      expect(result.returnedLines).toBeLessThanOrEqual(50);
      // Should not be truncated since we have less than 50 lines
      expect(result.wasTruncated).toBe(false);
    });

    test('should fall back to global when command-level not provided', async () => {
      const server = new TestCLIServer({
        global: {
          paths: { allowedPaths: [process.cwd()] },
          logging: {
            maxOutputLines: 30,
            enableTruncation: true,
            truncationMessage: '[Output truncated: Showing last {returnedLines} of {totalLines} lines]',
            maxStoredLogs: 100,
            maxLogSize: 1048576,
            maxTotalStorageSize: 10485760,
            enableLogResources: false,
            logRetentionMinutes: 60,
            cleanupIntervalMinutes: 10
          }
        }
      });

      // Use seq command to generate exactly 50 lines
      const result = await server.executeCommand({
        shell: 'wsl',
        command: 'seq 1 50'
        // No maxOutputLines - should use global 30
      });

      expect(result.exitCode).toBe(0);
      expect(result.returnedLines).toBe(30);
      expect(result.wasTruncated).toBe(true);
    });

    test('should use default when both undefined', async () => {
      const server = new TestCLIServer({
        global: {
          paths: { allowedPaths: [process.cwd()] },
          logging: {
            enableTruncation: true,
            truncationMessage: '[Output truncated]',
            maxStoredLogs: 100,
            maxLogSize: 1048576,
            maxTotalStorageSize: 10485760,
            enableLogResources: false,
            logRetentionMinutes: 60,
            cleanupIntervalMinutes: 10,
            maxOutputLines: 20 // Will be used
          }
        }
      });

      // Use seq command to generate exactly 40 lines
      const result = await server.executeCommand({
        shell: 'wsl',
        command: 'seq 1 40'
      });

      expect(result.exitCode).toBe(0);
      expect(result.returnedLines).toBe(20); // Default is 20
      expect(result.wasTruncated).toBe(true);
    });
  });

  describe('Truncation Behavior', () => {
    test('should truncate when output exceeds command-level limit', async () => {
      const server = new TestCLIServer({
        global: {
          paths: { allowedPaths: [process.cwd()] },
          logging: {
            maxOutputLines: 100,
            enableTruncation: true,
            truncationMessage: '[Output truncated: Showing last {returnedLines} of {totalLines} lines]',
            maxStoredLogs: 100,
            maxLogSize: 1048576,
            maxTotalStorageSize: 10485760,
            enableLogResources: false,
            logRetentionMinutes: 60,
            cleanupIntervalMinutes: 10
          }
        }
      });

      // Use seq command to generate exactly 50 lines
      const result = await server.executeCommand({
        shell: 'wsl',
        command: 'seq 1 50',
        maxOutputLines: 20
      });

      expect(result.exitCode).toBe(0);
      expect(result.totalLines).toBeGreaterThanOrEqual(50);
      expect(result.returnedLines).toBe(20);
      expect(result.wasTruncated).toBe(true);
    });

    test('should not truncate when output fits within limit', async () => {
      const server = new TestCLIServer({
        global: {
          paths: { allowedPaths: [process.cwd()] },
          logging: {
            maxOutputLines: 20,
            enableTruncation: true,
            truncationMessage: '[Output truncated]',
            maxStoredLogs: 100,
            maxLogSize: 1048576,
            maxTotalStorageSize: 10485760,
            enableLogResources: false,
            logRetentionMinutes: 60,
            cleanupIntervalMinutes: 10
          }
        }
      });

      const result = await server.executeCommand({
        shell: 'wsl',
        command: 'echo "Line 1" && echo "Line 2"',
        maxOutputLines: 50
      });

      expect(result.exitCode).toBe(0);
      expect(result.wasTruncated).toBe(false);
    });

    test('should handle exact match at limit', async () => {
      const server = new TestCLIServer({
        global: {
          paths: { allowedPaths: [process.cwd()] },
          logging: {
            maxOutputLines: 20,
            enableTruncation: true,
            truncationMessage: '[Output truncated]',
            maxStoredLogs: 100,
            maxLogSize: 1048576,
            maxTotalStorageSize: 10485760,
            enableLogResources: false,
            logRetentionMinutes: 60,
            cleanupIntervalMinutes: 10
          }
        }
      });

      // Use seq command to generate exactly 10 lines (with possible extra trailing line)
      const result = await server.executeCommand({
        shell: 'wsl',
        command: 'seq 1 10',
        maxOutputLines: 15  // Set high enough to avoid truncation
      });

      expect(result.exitCode).toBe(0);
      expect(result.totalLines).toBeGreaterThanOrEqual(10);
      expect(result.totalLines).toBeLessThanOrEqual(15);
      expect(result.wasTruncated).toBe(false);
    });
  });

  describe('Interaction with Global Settings', () => {
    test('should respect global enableTruncation=false', async () => {
      const server = new TestCLIServer({
        global: {
          paths: { allowedPaths: [process.cwd()] },
          logging: {
            maxOutputLines: 20,
            enableTruncation: false, // Truncation disabled globally
            truncationMessage: '[Output truncated]',
            maxStoredLogs: 100,
            maxLogSize: 1048576,
            maxTotalStorageSize: 10485760,
            enableLogResources: false,
            logRetentionMinutes: 60,
            cleanupIntervalMinutes: 10
          }
        }
      });

      // Generate more lines than limit
      const command = Array.from({ length: 30 }, (_, i) => `echo "Line ${i + 1}"`).join(' && ');

      const result = await server.executeCommand({
        shell: 'wsl',
        command,
        maxOutputLines: 10
      });

      expect(result.exitCode).toBe(0);
      expect(result.wasTruncated).toBe(false);
      expect(result.returnedLines).toBe(result.totalLines);
    });
  });

  describe('Backward Compatibility', () => {
    test('should work without maxOutputLines parameter', async () => {
      const server = new TestCLIServer({
        global: {
          paths: { allowedPaths: [process.cwd()] },
          logging: {
            maxOutputLines: 20,
            enableTruncation: true,
            truncationMessage: '[Output truncated]',
            maxStoredLogs: 100,
            maxLogSize: 1048576,
            maxTotalStorageSize: 10485760,
            enableLogResources: false,
            logRetentionMinutes: 60,
            cleanupIntervalMinutes: 10
          }
        }
      });

      const result = await server.executeCommand({
        shell: 'wsl',
        command: 'echo test'
        // No maxOutputLines parameter
      });

      expect(result.exitCode).toBe(0);
    });
  });
});
