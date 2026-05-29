import { describe, test, beforeEach, expect } from '@jest/globals';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';
import os from 'os';
import path from 'path';
import fs from 'fs';

const describeOnWindows = process.platform === 'win32' ? describe : describe.skip;

function buildWindowsTestConfig(
  activeShell: 'cmd' | 'powershell' | 'gitbash',
  extraOverrides?: Partial<ServerConfig>
): ServerConfig {
  const config: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  if (config.shells) {
    // Disable all shells first
    if (config.shells.cmd) config.shells.cmd.enabled = false;
    if (config.shells.powershell) config.shells.powershell.enabled = false;
    if (config.shells.gitbash) config.shells.gitbash.enabled = false;
    if (config.shells.bash) config.shells.bash.enabled = false;
    if (config.shells.wsl) config.shells.wsl.enabled = false;

    // Enable only the target shell
    if (config.shells[activeShell]) {
      config.shells[activeShell]!.enabled = true;
    }
  }

  if (config.global) {
    config.global.security.restrictWorkingDirectory = false;
    config.global.security.enableInjectionProtection = true;
  }

  if (extraOverrides) {
    if (extraOverrides.global) {
      config.global = {
        ...config.global,
        security: { ...config.global.security, ...extraOverrides.global.security },
        restrictions: { ...config.global.restrictions, ...extraOverrides.global.restrictions },
        paths: { ...config.global.paths, ...extraOverrides.global.paths },
      };
    }
    if (extraOverrides.shells) {
      for (const [name, shell] of Object.entries(extraOverrides.shells)) {
        if (shell) {
          (config.shells as any)[name] = {
            ...(config.shells as any)[name],
            ...shell,
          };
        }
      }
    }
  }

  return config;
}

// --- Phase 3.4: cmd shell basic test ---
describeOnWindows('Phase 3.4: cmd shell on native Windows', () => {
  let server: CLIServer;

  beforeEach(() => {
    server = new CLIServer(buildWindowsTestConfig('cmd'));
  });

  test('cmd.exe /c echo hello', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'cmd', command: 'echo hello' },
    }) as any;

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('hello');
    expect(result.metadata.exitCode).toBe(0);
  });
});

// --- Phase 3.5: powershell shell basic test ---
describeOnWindows('Phase 3.5: powershell shell on native Windows', () => {
  let server: CLIServer;

  beforeEach(() => {
    server = new CLIServer(buildWindowsTestConfig('powershell'));
  });

  test('powershell.exe -Command "echo hello"', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'powershell', command: 'echo hello' },
    }) as any;

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('hello');
    expect(result.metadata.exitCode).toBe(0);
  });
});

// --- Phase 6.1: cmd shell comprehensive tests ---
describeOnWindows('Phase 6.1: cmd shell real commands', () => {
  let server: CLIServer;

  beforeEach(() => {
    server = new CLIServer(buildWindowsTestConfig('cmd'));
  });

  test('echo with multiple words', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'cmd', command: 'echo hello world from cmd' },
    }) as any;

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('hello world from cmd');
    expect(result.metadata.exitCode).toBe(0);
  });

  test('echo with special characters', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'cmd', command: 'echo test-value_123' },
    }) as any;

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('test-value_123');
    expect(result.metadata.exitCode).toBe(0);
  });

  test('cd to temp directory', async () => {
    const tmpDir = os.tmpdir();
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'cmd', command: 'cd', workingDir: tmpDir },
    }) as any;

    expect(result.isError).toBe(false);
    expect(result.metadata.exitCode).toBe(0);
    // cmd cd outputs the current directory
    const output = result.content[0].text;
    expect(output.toLowerCase()).toContain('temp');
  });

  test('exit code propagation', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'cmd', command: 'exit /b 42' },
    }) as any;

    expect(result.isError).toBe(true);
    expect(result.metadata.exitCode).toBe(42);
  });

  test('dir command on temp directory', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'cmd', command: 'dir /b', workingDir: os.tmpdir() },
    }) as any;

    // dir may return exit code 0 even with empty output, or non-zero if the path has issues
    expect(result.metadata.exitCode).toBeDefined();
    expect(result.content[0].text).toBeDefined();
  });
});

// --- Phase 6.2: powershell shell comprehensive tests ---
describeOnWindows('Phase 6.2: powershell shell real commands', () => {
  let server: CLIServer;

  beforeEach(() => {
    server = new CLIServer(buildWindowsTestConfig('powershell'));
  });

  test('Get-Date returns output', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'powershell', command: 'Get-Date -Format "yyyy-MM-dd"' },
    }) as any;

    expect(result.isError).toBe(false);
    expect(result.metadata.exitCode).toBe(0);
    // Should contain a date pattern
    expect(result.content[0].text).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  test('$env:TEMP variable accessible', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'powershell', command: 'echo $env:TEMP' },
    }) as any;

    expect(result.isError).toBe(false);
    expect(result.metadata.exitCode).toBe(0);
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  test('working directory is respected', async () => {
    const tmpDir = os.tmpdir();
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'powershell', command: 'Get-Location', workingDir: tmpDir },
    }) as any;

    expect(result.isError).toBe(false);
    expect(result.metadata.workingDirectory).toBe(tmpDir);
  });

  test('exit code propagation', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'powershell', command: 'exit 7' },
    }) as any;

    expect(result.isError).toBe(true);
    expect(result.metadata.exitCode).toBe(7);
  });

  test('non-existent command produces error', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'powershell', command: 'Get-NonExistentCmdlet_XYZ' },
    }) as any;

    expect(result.isError).toBe(true);
    expect(result.metadata.exitCode).not.toBe(0);
  });
});

// --- Phase 6.3: gitbash shell comprehensive tests ---
describeOnWindows('Phase 6.3: gitbash shell real commands', () => {
  let server: CLIServer;

  beforeEach(() => {
    const gitBashPath = 'C:\\Program Files\\Git\\bin\\bash.exe';
    // Skip if git bash is not available at the default location
    if (!fs.existsSync(gitBashPath)) {
      return;
    }
    server = new CLIServer(buildWindowsTestConfig('gitbash'));
  });

  test('echo command', async () => {
    if (!server) return;
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'gitbash', command: 'echo hello from gitbash' },
    }) as any;

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('hello from gitbash');
    expect(result.metadata.exitCode).toBe(0);
  });

  test('pwd returns a path', async () => {
    if (!server) return;
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'gitbash', command: 'pwd' },
    }) as any;

    expect(result.isError).toBe(false);
    expect(result.metadata.exitCode).toBe(0);
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  test('uname returns output', async () => {
    if (!server) return;
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'gitbash', command: 'uname -a' },
    }) as any;

    expect(result.isError).toBe(false);
    expect(result.metadata.exitCode).toBe(0);
    // Git Bash uname reports MINGW or MSYS
    expect(result.content[0].text).toMatch(/MINGW|MSYS|Windows/i);
  });

  test('exit code propagation', async () => {
    if (!server) return;
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'gitbash', command: 'exit 55' },
    }) as any;

    expect(result.isError).toBe(true);
    expect(result.metadata.exitCode).toBe(55);
  });

  test('ls on temp directory', async () => {
    if (!server) return;
    const tmpDir = os.tmpdir();
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'gitbash', command: 'ls', workingDir: tmpDir },
    }) as any;

    expect(result.isError).toBe(false);
    expect(result.metadata.exitCode).toBe(0);
  });
});
