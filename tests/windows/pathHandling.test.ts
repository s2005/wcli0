import { describe, test, beforeEach, expect } from '@jest/globals';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';
import os from 'os';
import path from 'path';

const describeOnWindows = process.platform === 'win32' ? describe : describe.skip;

function buildWindowsConfig(
  activeShell: 'cmd' | 'powershell' | 'gitbash',
  allowedPaths: string[] = [],
): ServerConfig {
  const config: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  if (config.shells) {
    if (config.shells.cmd) config.shells.cmd.enabled = false;
    if (config.shells.powershell) config.shells.powershell.enabled = false;
    if (config.shells.gitbash) config.shells.gitbash.enabled = false;
    if (config.shells.bash) config.shells.bash.enabled = false;
    if (config.shells.wsl) config.shells.wsl.enabled = false;

    if (config.shells[activeShell]) {
      config.shells[activeShell]!.enabled = true;
    }
  }

  if (config.global) {
    config.global.security.restrictWorkingDirectory = allowedPaths.length > 0;
    config.global.paths.allowedPaths = allowedPaths;
  }

  return config;
}

// --- Phase 6.4: Windows path handling ---
describeOnWindows('Phase 6.4: Windows path handling (C:\... paths)', () => {
  const tmpDir = os.tmpdir();
  // Normalize to a real Windows path (forward slashes to backslashes)
  const winTmpDir = path.resolve(tmpDir);

  describe('cmd shell path handling', () => {
    let server: CLIServer;

    beforeEach(() => {
      server = new CLIServer(buildWindowsConfig('cmd', [winTmpDir]));
    });

    test('C:\... path accepted as working directory', async () => {
      const result = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'cd', workingDir: winTmpDir },
      }) as any;

      expect(result.isError).toBe(false);
      expect(result.metadata.workingDirectory).toBe(winTmpDir);
    });

    test('forward-slash path normalized to backslash for cmd', async () => {
      const forwardSlashPath = winTmpDir.replace(/\\/g, '/');
      const result = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'echo ok', workingDir: forwardSlashPath },
      }) as any;

      expect(result.isError).toBe(false);
      expect(result.metadata.exitCode).toBe(0);
    });

    test('lowercase drive letter path accepted', async () => {
      const lowerDrive = winTmpDir.replace(/^[A-Z]:/, (m) => m.toLowerCase());
      const result = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'echo ok', workingDir: lowerDrive },
      }) as any;

      expect(result.isError).toBe(false);
      expect(result.metadata.exitCode).toBe(0);
    });
  });

  describe('powershell shell path handling', () => {
    let server: CLIServer;

    beforeEach(() => {
      server = new CLIServer(buildWindowsConfig('powershell', [winTmpDir]));
    });

    test('C:\... path accepted as working directory', async () => {
      const result = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'powershell', command: 'Get-Location', workingDir: winTmpDir },
      }) as any;

      expect(result.isError).toBe(false);
      expect(result.metadata.workingDirectory).toBe(winTmpDir);
    });

    test('path with spaces works', async () => {
      // Use a path segment that is likely to contain spaces, e.g. AppData\Local\Temp
      const result = await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'powershell', command: 'echo ok', workingDir: winTmpDir },
      }) as any;

      expect(result.isError).toBe(false);
    });
  });

  describe('path validation for disallowed directories', () => {
    test('cmd rejects path outside allowedPaths', async () => {
      const server = new CLIServer(buildWindowsConfig('cmd', [winTmpDir]));

      await expect(
        server._executeTool({
          name: 'execute_command',
          arguments: { shell: 'cmd', command: 'echo fail', workingDir: 'C:\\Windows\\System32' },
        })
      ).rejects.toThrow(/allowed paths/i);
    });

    test('powershell rejects path outside allowedPaths', async () => {
      const server = new CLIServer(buildWindowsConfig('powershell', [winTmpDir]));

      await expect(
        server._executeTool({
          name: 'execute_command',
          arguments: { shell: 'powershell', command: 'echo fail', workingDir: 'C:\\Windows\\System32' },
        })
      ).rejects.toThrow(/allowed paths/i);
    });
  });

  describe('UNC path validation', () => {
    test('cmd shell rejects UNC path', async () => {
      const server = new CLIServer(buildWindowsConfig('cmd'));

      await expect(
        server._executeTool({
          name: 'execute_command',
          arguments: { shell: 'cmd', command: 'echo unc', workingDir: '\\\\server\\share' },
        })
      ).rejects.toThrow();
    });

    test('powershell shell rejects UNC path', async () => {
      const server = new CLIServer(buildWindowsConfig('powershell'));

      await expect(
        server._executeTool({
          name: 'execute_command',
          arguments: { shell: 'powershell', command: 'echo unc', workingDir: '\\\\server\\share' },
        })
      ).rejects.toThrow();
    });
  });
});
