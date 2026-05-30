import { describe, test, expect, afterEach } from '@jest/globals';
import { StreamableHttpTestClient } from '../helpers/StreamableHttpTestClient.js';

describe('Streamable HTTP Tool Execution', () => {
  let client: StreamableHttpTestClient | null = null;

  afterEach(async () => {
    if (client) {
      await client.close();
      client = null;
    }
  });

  test('execute_command basic echo', async () => {
    client = await StreamableHttpTestClient.create();
    const result = await client.callTool('execute_command', {
      shell: 'wsl',
      command: 'echo hello',
    });
    expect(result.content[0].text).toContain('hello');
    expect(result.metadata).toBeDefined();
    expect((result.metadata as any).exitCode).toBe(0);
  });

  test('execute_command with workingDir', async () => {
    client = await StreamableHttpTestClient.create({
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

  test('execute_command honors per-call maxOutputLines', async () => {
    client = await StreamableHttpTestClient.create();
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

  test('execute_command honors per-call timeout', async () => {
    client = await StreamableHttpTestClient.create();
    const result = await client.callTool('execute_command', {
      shell: 'wsl',
      command: 'echo fast',
      timeout: 5,
    });
    expect(result.content[0].text).toContain('fast');
    expect((result.metadata as any).exitCode).toBe(0);
  });

  test('execute_command failed command sets isError', async () => {
    client = await StreamableHttpTestClient.create();
    const result = await client.callTool('execute_command', {
      shell: 'wsl',
      command: 'ls /nonexistent_dir_xyz',
    });
    expect((result.metadata as any).exitCode).not.toBe(0);
    expect(result.isError).toBe(true);
  });

  test('get_config returns full structure', async () => {
    client = await StreamableHttpTestClient.create();
    const result = await client.callTool('get_config', {});
    const cfg = JSON.parse(result.content[0].text);
    expect(cfg).toHaveProperty('global');
    expect(cfg).toHaveProperty('shells');
    expect(cfg.global).toHaveProperty('security');
  });

  test('get_current_directory returns a path', async () => {
    client = await StreamableHttpTestClient.create();
    const result = await client.callTool('get_current_directory', {});
    expect(result.content[0].text).toBeTruthy();
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  test('set_current_directory then get_current_directory', async () => {
    client = await StreamableHttpTestClient.create({
      global: {
        security: {
          restrictWorkingDirectory: true,
          maxCommandLength: 2000,
          commandTimeout: 30,
          enableInjectionProtection: true,
        },
        paths: { allowedPaths: [process.cwd()] },
      } as any,
    });
    const setResult = await client.callTool('set_current_directory', {
      path: process.cwd(),
    });
    expect(setResult.isError).toBeFalsy();

    const getResult = await client.callTool('get_current_directory', {});
    expect(getResult.content[0].text).toBeTruthy();
  });

  test('get_command_output rejects an unknown executionId', async () => {
    client = await StreamableHttpTestClient.create();
    // An unknown executionId must error rather than return output, confirming
    // the tool is reachable and validated over the http transport.
    await expect(
      client.callTool('get_command_output', { executionId: 'does-not-exist' })
    ).rejects.toThrow();
  });
});
