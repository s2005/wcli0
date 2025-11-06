/**
 * Integration tests for per-command maxOutputLines parameter
 */

import { describe, test, expect } from '@jest/globals';
import { TestCLIServer } from '../helpers/TestCLIServer.js';

describe('Per-Command Output Limit Integration', () => {
  describe('End-to-End Command Execution', () => {
    test('should execute command with custom maxOutputLines', async () => {
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

      // Use seq command to generate exactly 100 lines
      const result = await server.executeCommand({
        shell: 'wsl',
        command: 'seq 1 100',
        maxOutputLines: 75
      });

      expect(result.exitCode).toBe(0);
      expect(result.totalLines).toBeGreaterThanOrEqual(100);
      expect(result.totalLines).toBeLessThanOrEqual(101);
      expect(result.returnedLines).toBe(75);
      expect(result.wasTruncated).toBe(true);
    });

    test('should execute without maxOutputLines using global default', async () => {
      const server = new TestCLIServer({
        global: {
          paths: { allowedPaths: [process.cwd()] },
          logging: {
            maxOutputLines: 25,
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
        command: 'seq 1 100'
        // No maxOutputLines - should use global 25
      });

      expect(result.exitCode).toBe(0);
      expect(result.returnedLines).toBe(25);
      expect(result.wasTruncated).toBe(true);
    });
  });

  describe('Real-World Scenarios', () => {
    test('should handle list directory with custom limit', async () => {
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
        command: 'ls -la',
        maxOutputLines: 100
      });

      expect(result.exitCode).toBe(0);
      expect(result.returnedLines).toBeLessThanOrEqual(100);
    });

    test('should handle echo command with minimal limit', async () => {
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
        command: 'echo "Hello World"',
        maxOutputLines: 5
      });

      expect(result.exitCode).toBe(0);
      expect(result.wasTruncated).toBe(false);
      expect(result.content).toContain('Hello World');
    });
  });

  describe('Error Cases', () => {
    test('should handle command failure with custom limit', async () => {
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
        command: 'ls /nonexistent/directory',
        maxOutputLines: 50
      });

      expect(result.exitCode).not.toBe(0);
      // Error output should still respect the limit
      expect(result.returnedLines).toBeLessThanOrEqual(50);
    });
  });

  describe('Different Shell Types', () => {
    test('should work with wsl shell', async () => {
      const server = new TestCLIServer({
        global: {
          paths: { allowedPaths: [process.cwd()] }
        }
      });

      const result = await server.executeCommand({
        shell: 'wsl',
        command: 'echo "WSL test"',
        maxOutputLines: 30
      });

      expect(result.exitCode).toBe(0);
    });

    test.skip('should work with bash shell', async () => {
      // Skipped: bash shell requires wsl which may not be available in test environment
      const server = new TestCLIServer({
        global: {
          paths: { allowedPaths: [process.cwd()] }
        },
        shells: {
          bash: {
            type: 'bash',
            enabled: true,
            executable: {
              command: 'wsl',
              args: ['bash', '-c']
            }
          }
        }
      });

      const result = await server.executeCommand({
        shell: 'bash',
        command: 'echo "Bash test"',
        maxOutputLines: 40
      });

      expect(result.exitCode).toBe(0);
    });
  });

  describe('Performance', () => {
    test('should handle large output with high limit efficiently', async () => {
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

      const startTime = Date.now();

      const result = await server.executeCommand({
        shell: 'wsl',
        command: 'seq 1 5000',
        maxOutputLines: 1000
      });

      const duration = Date.now() - startTime;

      expect(result.exitCode).toBe(0);
      expect(result.returnedLines).toBe(1000);
      expect(result.totalLines).toBeGreaterThanOrEqual(5000);
      expect(result.totalLines).toBeLessThanOrEqual(5001);
      // Should complete in reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(10000); // 10 seconds
    });
  });

  describe('Metadata', () => {
    test('should include correct metadata with custom limit', async () => {
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
        command: 'seq 1 200',
        maxOutputLines: 50
      });

      expect(result.exitCode).toBe(0);
      expect(result.metadata.shell).toBe('wsl');
      expect(result.totalLines).toBeGreaterThanOrEqual(200);
      expect(result.totalLines).toBeLessThanOrEqual(201);
      expect(result.returnedLines).toBe(50);
      expect(result.wasTruncated).toBe(true);
      expect(result.workingDirectory).toBeDefined();
    });
  });
});
