import { describe, test, expect, afterEach } from '@jest/globals';
import http from 'http';
import { SseTestClient } from '../helpers/SseTestClient.js';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';
import { closeSseServer } from '../../src/utils/transport.js';

describe('SSE Security Scenarios', () => {
  let client: SseTestClient | null = null;

  afterEach(async () => {
    if (client) {
      await client.close();
      client = null;
    }
  });

  test('blocked operator rejection (;)', async () => {
    client = await SseTestClient.create({
      global: {
        security: {
          restrictWorkingDirectory: false,
          maxCommandLength: 2000,
          commandTimeout: 30,
          enableInjectionProtection: true,
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: [';', '&', '|', '`'],
        },
        paths: { allowedPaths: [] },
      },
    });
    await expect(
      client.callTool('execute_command', { shell: 'wsl', command: 'echo hi ; ls' })
    ).rejects.toThrow();
  });

  test('blocked pipe rejection (|)', async () => {
    client = await SseTestClient.create({
      global: {
        security: {
          restrictWorkingDirectory: false,
          maxCommandLength: 2000,
          commandTimeout: 30,
          enableInjectionProtection: true,
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: [';', '&', '|', '`'],
        },
        paths: { allowedPaths: [] },
      },
    });
    await expect(
      client.callTool('execute_command', { shell: 'wsl', command: 'echo hi | grep hi' })
    ).rejects.toThrow();
  });

  test('blocked ampersand rejection (&)', async () => {
    client = await SseTestClient.create({
      global: {
        security: {
          restrictWorkingDirectory: false,
          maxCommandLength: 2000,
          commandTimeout: 30,
          enableInjectionProtection: true,
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: [';', '&', '|', '`'],
        },
        paths: { allowedPaths: [] },
      },
    });
    await expect(
      client.callTool('execute_command', { shell: 'wsl', command: 'echo hi & ls' })
    ).rejects.toThrow();
  });

  test('path restriction enforced', async () => {
    client = await SseTestClient.create({
      global: {
        security: {
          restrictWorkingDirectory: true,
          maxCommandLength: 2000,
          commandTimeout: 30,
          enableInjectionProtection: false,
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: [],
        },
        paths: { allowedPaths: ['/allowed_only'] },
      },
    });
    await expect(
      client.callTool('execute_command', {
        shell: 'wsl',
        command: 'pwd',
        workingDir: '/tmp',
      })
    ).rejects.toThrow();
  });

  test('path restriction allowed', async () => {
    client = await SseTestClient.create({
      global: {
        security: {
          restrictWorkingDirectory: true,
          maxCommandLength: 2000,
          commandTimeout: 30,
          enableInjectionProtection: false,
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
    expect(result.isError).toBeFalsy();
    expect((result.metadata as any).exitCode).toBe(0);
  });

  test('unknown tool name returns error', async () => {
    client = await SseTestClient.create();
    await expect(
      client.callTool('nonexistent_tool_xyz', {})
    ).rejects.toThrow();
  });

  test('missing required argument returns error', async () => {
    client = await SseTestClient.create();
    await expect(
      client.callTool('execute_command', { shell: 'wsl' })
    ).rejects.toThrow();
  });

  test('invalid shell name returns error', async () => {
    client = await SseTestClient.create();
    await expect(
      client.callTool('execute_command', { shell: 'nonexistent', command: 'echo hi' })
    ).rejects.toThrow();
  });

  test('command too long returns error', async () => {
    client = await SseTestClient.create({
      global: {
        security: {
          restrictWorkingDirectory: false,
          maxCommandLength: 10,
          commandTimeout: 30,
          enableInjectionProtection: false,
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: [],
        },
        paths: { allowedPaths: [] },
      },
    });
    await expect(
      client.callTool('execute_command', {
        shell: 'wsl',
        command: 'this command is way too long and exceeds the max',
      })
    ).rejects.toThrow();
  });

  test('unknown session POST returns 404', async () => {
    client = await SseTestClient.create();
    const port = client.port;

    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 999,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

    const result = await new Promise<{ statusCode: number | undefined }>((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${port}/messages?sessionId=nonexistent-session-id`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve({ statusCode: res.statusCode }));
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    expect(result.statusCode).toBe(404);
  });

  test('concurrent sessions isolated', async () => {
    const client1 = await SseTestClient.create();
    const client2 = await SseTestClient.create();

    try {
      const [result1, result2] = await Promise.all([
        client1.callTool('execute_command', { shell: 'wsl', command: 'echo one' }),
        client2.callTool('execute_command', { shell: 'wsl', command: 'echo two' }),
      ]);

      expect(result1.content[0].text).toContain('one');
      expect(result2.content[0].text).toContain('two');
    } finally {
      await client1.close();
      await client2.close();
    }
  });
});
