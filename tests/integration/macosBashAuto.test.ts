import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { TestCLIServer } from '../helpers/TestCLIServer.js';

describe('macOS Bash Integration', () => {
  let server: TestCLIServer;

  beforeAll(async () => {
    server = new TestCLIServer({
      global: {
        paths: { allowedPaths: ['/tmp'] }
      },
      shells: {
        bash: { type: 'bash', enabled: true }
      }
    });
  });

  afterAll(async () => {
    // Note: TestCLIServer doesn't have explicit cleanup method
    // No cleanup needed as we're using bash shell
  });

  describe('Unix Path Validation', () => {
    test('accepts /tmp paths', async () => {
      const result = await server.executeCommand({
        shell: 'bash',
        command: 'pwd',
        workingDir: '/tmp'
      });
      expect(result.exitCode).toBe(0);
      expect(result.content.trim()).toMatch(/^\/(private\/)?tmp$/);
    });

    test('rejects Windows paths', async () => {
      const result = await server.executeCommand({
        shell: 'bash',
        command: 'cd C:\\Users',
        workingDir: '/tmp'
      });
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('macOS Command Blocking', () => {
    test('blocks dangerous commands', async () => {
      await expect(
        server.executeCommand({
          shell: 'bash',
          command: 'shutdown now',
          workingDir: '/tmp'
        })
      ).rejects.toThrow(/blocked/i);
    });

    test('allows safe commands', async () => {
      const result = await server.executeCommand({
        shell: 'bash',
        command: 'ls /tmp',
        workingDir: '/tmp'
      });
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Working Directory Restrictions', () => {
    test('rejects commands outside allowed paths', async () => {
      await expect(
        server.executeCommand({
          shell: 'bash',
          command: 'pwd',
          workingDir: '/private'
        })
      ).rejects.toThrow(/validation failed|not allowed|allowed paths/i);
    });

    test('allows commands in allowed paths', async () => {
      const result = await server.executeCommand({
        shell: 'bash',
        command: 'pwd',
        workingDir: '/tmp'
      });
      expect(result.exitCode).toBe(0);
    });
  });
});
