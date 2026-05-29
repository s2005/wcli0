import { describe, test, expect, afterEach } from '@jest/globals';
import { SseTestClient } from '../helpers/SseTestClient.js';

describe('SSE Tool Execution', () => {
  let client: SseTestClient | null = null;

  afterEach(async () => {
    if (client) {
      await client.close();
      client = null;
    }
  });

  test('execute_command basic echo', async () => {
    client = await SseTestClient.create();
    const result = await client.callTool('execute_command', {
      shell: 'wsl',
      command: 'echo hello',
    });
    expect(result.content[0].text).toContain('hello');
    expect(result.metadata).toBeDefined();
    expect((result.metadata as any).exitCode).toBe(0);
  });

  test('execute_command with workingDir', async () => {
    client = await SseTestClient.create({
      global: {
        security: {
          restrictWorkingDirectory: true,
          maxCommandLength: 2000,
          commandTimeout: 30,
          enableInjectionProtection: true,
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: [],
        },
        paths: { allowedPaths: ['/tmp'] },
      },
    });
    const result = await client.callTool('execute_command', {
      shell: 'wsl',
      command: 'pwd',
      workingDir: '/tmp',
    });
    expect(result.content[0].text).toContain('/tmp');
    expect((result.metadata as any).exitCode).toBe(0);
    expect((result.metadata as any).workingDirectory).toBe('/tmp');
  });

  test('execute_command output metadata with truncation', async () => {
    client = await SseTestClient.create();
    const result = await client.callTool('execute_command', {
      shell: 'wsl',
      command: 'seq 1 50',
      maxOutputLines: 20,
    });
    const meta = result.metadata as any;
    expect(meta.totalLines).toBeGreaterThanOrEqual(50);
    expect(meta.returnedLines).toBe(20);
    expect(meta.wasTruncated).toBe(true);
    expect(meta.exitCode).toBe(0);
  });

  test('execute_command with timeout', async () => {
    client = await SseTestClient.create();
    const result = await client.callTool('execute_command', {
      shell: 'wsl',
      command: 'echo fast',
      timeout: 5,
    });
    expect(result.content[0].text).toContain('fast');
    expect((result.metadata as any).exitCode).toBe(0);
  });

  test('execute_command failed command', async () => {
    client = await SseTestClient.create();
    const result = await client.callTool('execute_command', {
      shell: 'wsl',
      command: 'ls /nonexistent_dir_xyz',
    });
    expect((result.metadata as any).exitCode).not.toBe(0);
    expect(result.isError).toBe(true);
  });

  test('validate_directories valid path', async () => {
    client = await SseTestClient.create({
      global: {
        security: {
          restrictWorkingDirectory: true,
          maxCommandLength: 2000,
          commandTimeout: 30,
          enableInjectionProtection: true,
        },
        paths: { allowedPaths: [process.cwd()] },
      },
    });
    const result = await client.callTool('validate_directories', {
      directories: [process.cwd()],
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('All specified directories');
  });

  test('validate_directories invalid path', async () => {
    client = await SseTestClient.create({
      global: {
        security: {
          restrictWorkingDirectory: true,
          maxCommandLength: 2000,
          commandTimeout: 30,
          enableInjectionProtection: true,
        },
        paths: { allowedPaths: ['/allowed_only'] },
      },
    });
    const result = await client.callTool('validate_directories', {
      directories: ['/not_allowed'],
    });
    expect(result.isError).toBe(true);
  });

  test('get_config returns full structure', async () => {
    client = await SseTestClient.create();
    const result = await client.callTool('get_config', {});
    const cfg = JSON.parse(result.content[0].text);
    expect(cfg).toHaveProperty('global');
    expect(cfg).toHaveProperty('shells');
    expect(cfg.global).toHaveProperty('security');
    expect(cfg.global).toHaveProperty('restrictions');
  });

  test('get_current_directory returns a path', async () => {
    client = await SseTestClient.create();
    const result = await client.callTool('get_current_directory', {});
    expect(result.content[0].text).toBeTruthy();
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  test('set_current_directory and verify', async () => {
    client = await SseTestClient.create({
      global: {
        security: {
          restrictWorkingDirectory: true,
          maxCommandLength: 2000,
          commandTimeout: 30,
          enableInjectionProtection: true,
        },
        paths: { allowedPaths: [process.cwd()] },
      },
    });
    const setResult = await client.callTool('set_current_directory', {
      path: process.cwd(),
    });
    expect(setResult.isError).toBeFalsy();

    const getResult = await client.callTool('get_current_directory', {});
    expect(getResult.content[0].text).toBeTruthy();
  });

  test('tools/list includes all expected tools', async () => {
    client = await SseTestClient.create({
      global: {
        security: {
          restrictWorkingDirectory: true,
          maxCommandLength: 2000,
          commandTimeout: 30,
          enableInjectionProtection: true,
        },
        paths: { allowedPaths: [process.cwd()] },
      },
    });
    const response = await client.call('tools/list');
    const toolNames = response.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('execute_command');
    expect(toolNames).toContain('get_config');
    expect(toolNames).toContain('get_current_directory');
    expect(toolNames).toContain('set_current_directory');
    expect(toolNames).toContain('validate_directories');
  });
});
