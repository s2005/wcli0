/**
 * Unit tests for log file content format
 * Tests that file-based logs include proper metadata header
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { LogStorageManager } from '../../src/utils/logStorage.js';
import { LoggingConfig } from '../../src/types/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Wait for file content to be fully available, not just file existence.
 * This avoids races with async writes on slower filesystems (e.g. Windows CI).
 */
async function waitForFileContent(
  filePath: string,
  isReady: (content: string) => boolean = content => content.length > 0,
  timeoutMs = 4000,
  intervalMs = 50
): Promise<string> {
  const start = Date.now();
  let lastContent = '';

  while (Date.now() - start < timeoutMs) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      lastContent = content;
      if (isReady(content)) {
        return content;
      }
    } catch {
      // File may not exist yet or may still be in-flight; keep polling.
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `File ${filePath} did not contain expected content within ${timeoutMs}ms. Last content length: ${lastContent.length}`
  );
}

describe('LogStorageManager - File Content Format', () => {
  let storage: LogStorageManager;
  let config: LoggingConfig;
  let testLogDir: string;

  beforeEach(() => {
    // Create a temporary directory for test logs
    testLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcli-test-logs-'));
    
    config = {
      maxOutputLines: 20,
      enableTruncation: true,
      truncationMessage: '[Output truncated]',
      maxStoredLogs: 10,
      maxLogSize: 1024 * 10, // 10KB
      maxTotalStorageSize: 1024 * 100,
      enableLogResources: true,
      logRetentionMinutes: 60,
      cleanupIntervalMinutes: 5,
      logDirectory: testLogDir
    };
    storage = new LogStorageManager(config);
  });

  afterEach(() => {
    storage.stopCleanup();
    storage.clear();
    
    // Clean up test directory
    try {
      const files = fs.readdirSync(testLogDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testLogDir, file));
      }
      fs.rmdirSync(testLogDir);
    } catch {
      // Ignore cleanup errors
    }
  });

  test('should include metadata header in log file', async () => {
    const id = storage.storeLog(
      'echo "hello world"',
      'gitbash',
      '/home/user/project',
      'hello world',
      '',
      0
    );

    const log = storage.getLog(id);
    expect(log?.filePath).toBeDefined();

    const filePath = path.isAbsolute(log!.filePath!)
      ? log!.filePath!
      : path.join(testLogDir, log!.filePath!);

    // Wait for async file write to include header and output
    const content = await waitForFileContent(filePath, value =>
      value.includes('# Command Execution Log') && value.includes('hello world')
    );

    // Check header is present
    expect(content).toContain('# Command Execution Log');
    expect(content).toContain('# ====================');
    expect(content).toContain(`# Execution ID: ${id}`);
    expect(content).toContain('# Shell: gitbash');
    expect(content).toContain('# Working Directory: /home/user/project');
    expect(content).toContain('# Command: echo "hello world"');
    expect(content).toContain('# Exit Code: 0');
    expect(content).toContain('# Total Lines:');
    expect(content).toContain('# --- Output ---');

    // Check output is present after header
    expect(content).toContain('hello world');
  });

  test('should include timestamp in ISO format', async () => {
    const beforeStore = new Date();
    const id = storage.storeLog('ls', 'bash', '/', 'output', '', 0);
    const afterStore = new Date();

    const log = storage.getLog(id);
    const filePath = path.isAbsolute(log!.filePath!)
      ? log!.filePath!
      : path.join(testLogDir, log!.filePath!);

    const content = await waitForFileContent(filePath, value => value.includes('# Timestamp: '));

    // Extract timestamp from content
    const timestampMatch = content.match(/# Timestamp: (.+)/);
    expect(timestampMatch).toBeDefined();

    const timestamp = new Date(timestampMatch![1]);
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeStore.getTime());
    expect(timestamp.getTime()).toBeLessThanOrEqual(afterStore.getTime());
  });

  test('should handle failed command with non-zero exit code', async () => {
    const id = storage.storeLog(
      'bad-command',
      'cmd',
      'C:\\Users\\test',
      '',
      'command not found',
      127
    );

    const log = storage.getLog(id);
    const filePath = path.isAbsolute(log!.filePath!)
      ? log!.filePath!
      : path.join(testLogDir, log!.filePath!);

    const content = await waitForFileContent(filePath, value => value.includes('command not found'));

    expect(content).toContain('# Exit Code: 127');
    expect(content).toContain('# Command: bad-command');
    expect(content).toContain('command not found');
  });

  test('should handle special characters in command', async () => {
    const specialCmd = 'echo "test" && ls -la | grep "*.ts"';
    const id = storage.storeLog(specialCmd, 'bash', '/', 'output', '', 0);

    const log = storage.getLog(id);
    const filePath = path.isAbsolute(log!.filePath!)
      ? log!.filePath!
      : path.join(testLogDir, log!.filePath!);

    const content = await waitForFileContent(filePath, value => value.includes(`# Command: ${specialCmd}`));

    expect(content).toContain(`# Command: ${specialCmd}`);
  });

  test('should handle multiline output', async () => {
    const multilineOutput = 'line1\nline2\nline3\nline4\nline5';
    const id = storage.storeLog('ls', 'bash', '/', multilineOutput, '', 0);

    const log = storage.getLog(id);
    const filePath = path.isAbsolute(log!.filePath!)
      ? log!.filePath!
      : path.join(testLogDir, log!.filePath!);

    const content = await waitForFileContent(filePath, value =>
      value.includes('# --- Output ---') && value.includes('line1\nline2\nline3\nline4\nline5')
    );

    // Header should come before output
    const headerEnd = content.indexOf('# --- Output ---');
    const outputStart = content.indexOf('line1');

    expect(headerEnd).toBeLessThan(outputStart);
    expect(content).toContain('line1\nline2\nline3\nline4\nline5');
  });

  test('should preserve header when log is truncated due to size', async () => {
    // Create a large output that exceeds maxLogSize
    const largeOutput = 'x'.repeat(config.maxLogSize + 1000);
    const id = storage.storeLog('big-cmd', 'bash', '/big/dir', largeOutput, '', 0);

    const log = storage.getLog(id);
    const filePath = path.isAbsolute(log!.filePath!)
      ? log!.filePath!
      : path.join(testLogDir, log!.filePath!);

    const content = await waitForFileContent(filePath, value =>
      value.includes('# Command Execution Log') &&
      value.includes('# Command: big-cmd') &&
      value.includes('# Working Directory: /big/dir')
    );

    // Header should still be present even if content is truncated
    expect(content).toContain('# Command Execution Log');
    expect(content).toContain('# Command: big-cmd');
    expect(content).toContain('# Working Directory: /big/dir');
  });
});
