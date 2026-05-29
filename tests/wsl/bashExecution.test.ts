import { describe, test, beforeEach, afterEach, expect } from '@jest/globals';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';
import { McpError, ErrorCode, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import crypto from 'crypto';

// --- WSL2 detection guard ---
function isRunningInWsl2(): boolean {
  if (process.platform !== 'linux') return false;
  try {
    const version = fs.readFileSync('/proc/version', 'utf8');
    return version.toLowerCase().includes('microsoft');
  } catch {
    return false;
  }
}

const describeBash = isRunningInWsl2() ? describe : describe.skip;

// --- Helpers ---

function buildBashTestConfig(extraOverrides?: Partial<ServerConfig>): ServerConfig {
  const config: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  if (config.shells) {
    // Disable all shells first
    if (config.shells.cmd) config.shells.cmd.enabled = false;
    if (config.shells.powershell) config.shells.powershell.enabled = false;
    if (config.shells.gitbash) config.shells.gitbash.enabled = false;
    if (config.shells.wsl) config.shells.wsl.enabled = false;

    // Enable bash with native executable
    config.shells.bash = {
      type: 'bash',
      enabled: true,
      executable: {
        command: 'bash',
        args: ['-c'],
      },
      overrides: {
        restrictions: {
          blockedOperators: ['&', '|', ';', '`'],
        },
      },
    };
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
          (config.shells as Record<string, unknown>)[name] = {
            ...(config.shells as Record<string, unknown>)[name],
            ...shell,
          };
        }
      }
    }
  }

  return config;
}

function buildBashCwdTestConfig(allowedPaths: string[]): ServerConfig {
  const config: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  if (config.shells) {
    // Disable all shells
    if (config.shells.cmd) config.shells.cmd.enabled = false;
    if (config.shells.powershell) config.shells.powershell.enabled = false;
    if (config.shells.gitbash) config.shells.gitbash.enabled = false;
    if (config.shells.wsl) config.shells.wsl.enabled = false;

    config.shells.bash = {
      type: 'bash',
      enabled: true,
      executable: {
        command: 'bash',
        args: ['-c'],
      },
      overrides: {
        restrictions: {
          blockedOperators: ['&', '|', ';', '`'],
        },
      },
    };
  }

  if (config.global) {
    config.global.security.restrictWorkingDirectory = true;
    config.global.security.enableInjectionProtection = false;
    config.global.paths.allowedPaths = allowedPaths;
  }

  return config;
}

// --- Group 1: Basic Command Execution ---

describeBash('R1-R4: Real bash in WSL2 - Basic Command Execution', () => {
  let server: CLIServer;

  beforeEach(() => {
    server = new CLIServer(buildBashTestConfig());
  });

  test('R1: Basic command execution (echo)', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'bash', command: 'echo hello bash in wsl2' },
    }) as CallToolResult;

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('hello bash in wsl2');
    expect((result.metadata as Record<string, unknown>)?.exitCode).toBe(0);
  });

  test('R2: Command with a specific error exit code', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'bash', command: 'exit 42' },
    }) as CallToolResult;

    expect(result.isError).toBe(true);
    expect((result.metadata as Record<string, unknown>)?.exitCode).toBe(42);
    expect(result.content[0].text).toContain('Command failed with exit code 42');
  });

  test('R3: Command producing stderr output', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'bash', command: 'ls /nonexistent_directory_for_bash_test_xyz' },
    }) as CallToolResult;

    expect(result.isError).toBe(true);
    expect([1, 2]).toContain((result.metadata as Record<string, unknown>)?.exitCode);
    expect(result.content[0].text).toMatch(/No such file or directory|cannot access/i);
    expect(result.content[0].text).toContain('Error output:');
  });

  test('R4: Injection protection (semicolon)', async () => {
    try {
      await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'bash', command: 'echo bad ; ls' },
      });
      throw new Error('Test failed: Command with semicolon should have been rejected');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(McpError);
      const mcpError = e as McpError;
      expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
      expect(mcpError.message).toContain('Command contains blocked operator for bash: ;');
    }
  });
});

// --- Group 2: Extended Command Execution ---

describeBash('R4.1-R4.3: Real bash in WSL2 - Extended Command Execution', () => {
  let server: CLIServer;

  beforeEach(() => {
    server = new CLIServer(buildBashTestConfig());
  });

  test('R4.1: uname -a execution', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'bash', command: 'uname -a' },
    }) as CallToolResult;

    expect(result.isError).toBe(false);
    expect((result.metadata as Record<string, unknown>)?.exitCode).toBe(0);
    // Real bash in WSL2 reports Linux, not Msys
    expect(result.content[0].text).toContain('Linux');
  });

  test('R4.2: Command with multiple arguments (ls -la /tmp)', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'bash', command: 'ls -la /tmp' },
    }) as CallToolResult;

    expect(result.isError).toBe(false);
    expect((result.metadata as Record<string, unknown>)?.exitCode).toBe(0);
    expect(result.content[0].text).toMatch(/total\s\d+/);
    expect(result.content[0].text).toContain('.');
    expect(result.content[0].text).toContain('..');
  });

  test('R4.3: Command with non-existent path argument', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'bash', command: 'ls /no/such/path/at/all' },
    }) as CallToolResult;

    expect(result.isError).toBe(true);
    expect((result.metadata as Record<string, unknown>)?.exitCode).not.toBe(0);
    expect(result.content[0].text).toMatch(/No such file or directory|cannot access/i);
  });
});

// --- Group 3: Working Directory Validation ---

describeBash('R5.1-R5.4: Real bash in WSL2 - Working Directory Validation', () => {
  let server: CLIServer;
  let allowedBase: string;
  let createdDirs: string[] = [];

  beforeEach(() => {
    allowedBase = `/tmp/bash-test-${crypto.randomBytes(4).toString('hex')}`;
    fs.mkdirSync(allowedBase, { recursive: true });
    createdDirs.push(allowedBase);

    server = new CLIServer(buildBashCwdTestConfig([allowedBase]));
  });

  afterEach(() => {
    for (const dir of createdDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
    createdDirs = [];
  });

  test('R5.1: Valid working directory (subdirectory under allowed path)', async () => {
    const subDir = `${allowedBase}/sub`;
    fs.mkdirSync(subDir, { recursive: true });

    const result = await server._executeTool({
      name: 'execute_command',
      arguments: {
        shell: 'bash',
        command: 'pwd',
        workingDir: subDir,
      },
    }) as CallToolResult;

    expect(result.isError).toBe(false);
    expect((result.metadata as Record<string, unknown>)?.exitCode).toBe(0);
    expect(result.content[0].text.trim()).toBe(subDir);
    expect((result.metadata as Record<string, unknown>)?.workingDirectory).toBe(subDir);
  });

  test('R5.1.1: Valid working directory (/tmp)', async () => {
    const tmpConfig = buildBashCwdTestConfig(['/tmp']);
    server = new CLIServer(tmpConfig);

    const result = await server._executeTool({
      name: 'execute_command',
      arguments: {
        shell: 'bash',
        command: 'pwd',
        workingDir: '/tmp',
      },
    }) as CallToolResult;

    expect(result.isError).toBe(false);
    expect((result.metadata as Record<string, unknown>)?.exitCode).toBe(0);
    expect(result.content[0].text.trim()).toBe('/tmp');
    expect((result.metadata as Record<string, unknown>)?.workingDirectory).toBe('/tmp');
  });

  test('R5.2: Invalid working directory (not in allowedPaths)', async () => {
    try {
      await server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'bash',
          command: 'pwd',
          workingDir: '/opt/forbidden_dir',
        },
      });
      throw new Error('Test failed: Command with invalid CWD should have been rejected');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(McpError);
      const mcpError = e as McpError;
      expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
      expect(mcpError.message).toContain('Working directory validation failed');
      expect(mcpError.message).toContain('must be within allowed paths');
    }
  });

  test('R5.3: Invalid working directory (prefix match, not containment)', async () => {
    // allowedBase is /tmp/bash-test-<rand>, so /tmp/bash-test-<rand>-suffix
    // is NOT contained within it (prefix match is not directory containment)
    const suffixDir = `${allowedBase}-suffix`;

    try {
      await server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'bash',
          command: 'pwd',
          workingDir: suffixDir,
        },
      });
      throw new Error('Test failed: Command with prefix-match CWD should have been rejected');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(McpError);
      const mcpError = e as McpError;
      expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
      expect(mcpError.message).toContain('Working directory validation failed');
      expect(mcpError.message).toContain('must be within allowed paths');
    }
  });

  test('R5.4: Invalid working directory (pure Linux path not in allowedPaths)', async () => {
    try {
      await server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'bash',
          command: 'pwd',
          workingDir: '/usr/local',
        },
      });
      throw new Error('Test failed: Command with pure Linux path not in allowedPaths should have been rejected');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(McpError);
      const mcpError = e as McpError;
      expect(mcpError.code).toBe(ErrorCode.InvalidRequest);
      expect(mcpError.message).toContain('Working directory validation failed');
      expect(mcpError.message).toContain('must be within allowed paths');
    }
  });
});
