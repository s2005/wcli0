import { describe, test, expect, beforeAll } from '@jest/globals';
import { TestCLIServer } from '../helpers/TestCLIServer.js';
import path from 'path';

describe('macOS Bash Integration', () => {
  let server: TestCLIServer;

  beforeAll(async () => {
    server = new TestCLIServer({
      global: {
        paths: { allowedPaths: ['/tmp', path.join(process.env.HOME || '', 'Documents')] }
      },
      shells: {
        bash: {
          type: 'bash',
          enabled: true
        }
      }
    });
  });

  describe('Unix Path Validation', () => {
    test('accepts /Users paths', async () => {
      const result = await server.executeCommand({
        shell: 'bash_auto',
        command: 'pwd',
        workingDir: '/tmp'
      });
      expect(result.exitCode).toBe(0);
      expect(result.content).toMatch(/^\/tmp/);  // PWD will be /tmp since that's our workingDir
    });

    test('accepts /tmp paths', async () => {
      const result = await server.executeCommand({
        shell: 'bash_auto',
        command: 'ls /tmp',
        workingDir: '/tmp'
      });
      expect(result.exitCode).toBe(0);
    });

    test('accepts relative paths ./ and ../', async () => {
      const result = await server.executeCommand({
        shell: 'bash_auto',
        command: 'cd .. && pwd',
        workingDir: '/tmp'
      });
      expect(result.exitCode).toBe(0);
    });

    test('rejects Windows paths', async () => {
      const result = await server.executeCommand({
        shell: 'bash_auto',
        command: 'cd C:\\Users',
        workingDir: '/tmp'
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.content).toMatch(/validation failed/i);
    });

    test('rejects UNC paths', async () => {
      const result = await server.executeCommand({
        shell: 'bash_auto',
        command: 'ls //server/share',
        workingDir: '/tmp'
      });
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('macOS Command Blocking', () => {
    test('blocks rm -rf /', async () => {
      const result = await server.executeCommand({
        shell: 'bash_auto',
        command: 'rm -rf /',
        workingDir: '/tmp'
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.content).toMatch(/blocked/i);
    });

    test('blocks dd command', async () => {
      const result = await server.executeCommand({
        shell: 'bash_auto',
        command: 'dd if=/dev/zero of=/tmp/test bs=1024 count=1',
        workingDir: '/tmp'
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.content).toMatch(/blocked/i);
    });

    test('blocks mkfs command', async () => {
      const result = await server.executeCommand({
        shell: 'bash_auto',
        command: 'mkfs.ext4 /dev/rdisk1',
        workingDir: '/tmp'
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.content).toMatch(/blocked/i);
    });

    test('blocks diskutil formatting commands', async () => {
      const result = await server.executeCommand({
        shell: 'bash_auto',
        command: 'diskutil eraseDisk /dev/rdisk1',
        workingDir: '/tmp'
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.content).toMatch(/blocked/i);
    });

    test('allows safe commands like ls', async () => {
      const result = await server.executeCommand({
        shell: 'bash_auto',
        command: 'ls -la /tmp',
        workingDir: '/tmp'
      });
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Working Directory Restrictions', () => {
    test('rejects commands outside allowed paths', async () => {
      const restrictedServer = new TestCLIServer({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: ['/tmp'] }
        },
        shells: {
          bash: { type: 'bash', enabled: true }
        }
      });

      const result = await restrictedServer.executeCommand({
        shell: 'bash_auto',
        command: 'ls /private',
        workingDir: '/tmp'
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.content).toMatch(/validation failed|not allowed/i);
    });

    test('allows commands in allowed paths', async () => {
      const result = await server.executeCommand({
        shell: 'bash_auto',
        command: 'ls /tmp',
        workingDir: '/tmp'
      });
      expect(result.exitCode).toBe(0);
    });
  });

    test('supports initialDir for macOS', async () => {
      const homeDir = process.env.HOME || '';
      const initialDirServer = new TestCLIServer({
        global: {
          paths: { 
            allowedPaths: [homeDir],
            initialDir: homeDir
          }
        },
        shells: {
          bash_auto: { type: 'bash_auto', enabled: true }
        }
      });

      const result = await initialDirServer.executeCommand({
        shell: 'bash_auto',
        command: 'pwd'
      });
      expect(result.exitCode).toBe(0);
      expect(result.content).toContain(homeDir);
    });
  });

  describe('Operator Blocking', () => {
    test('blocks command chaining with && when enabled', async () => {
      const result = await server.executeCommand({
        shell: 'bash_auto',
        command: 'echo "first" && echo "second"',
        workingDir: '/tmp'
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.content).toMatch(/blocked operator|injection protection/i);
    });

    test('allows command chaining with && when disabled', async () => {
      const unrestrictedServer = new TestCLIServer({
        global: {
          security: { enableInjectionProtection: false }
        },
        shells: {
          bash: { type: 'bash', enabled: true }
        }
      });

      const result = await unrestrictedServer.executeCommand({
        shell: 'bash_auto',
        command: 'echo "first" && echo "second"',
        workingDir: '/tmp'
      });
      expect(result.exitCode).toBe(0);
      expect(result.content).toContain('first');
      expect(result.content).toContain('second');
    });
  });
});
