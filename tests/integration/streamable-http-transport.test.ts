import { describe, test, expect, afterEach } from '@jest/globals';
import http from 'http';
import { StreamableHttpTestClient, mcpHttpRequest } from '../helpers/StreamableHttpTestClient.js';

describe('Streamable HTTP Transport: handshake and lifecycle', () => {
  let client: StreamableHttpTestClient | null = null;

  afterEach(async () => {
    if (client) {
      await client.close();
      client = null;
    }
  });

  test('initialize handshake assigns an Mcp-Session-Id', async () => {
    client = await StreamableHttpTestClient.create();
    expect(client.session).toBeTruthy();
    expect(client.session.length).toBeGreaterThan(0);
  });

  test('initialize response reports the negotiated protocol and server info', async () => {
    // Drive the initialize directly so the raw response can be inspected.
    const probe = await StreamableHttpTestClient.create();
    client = probe;
    const res = await mcpHttpRequest(probe.port, {
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'probe', version: '1.0.0' },
        },
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.sessionId).toBeTruthy();
    const initMsg = res.messages.find((m) => m.id === 1);
    expect(initMsg).toBeDefined();
    expect(initMsg.result.serverInfo.name).toBe('wcli0');
    expect(initMsg.result.protocolVersion).toBeTruthy();
  });

  // P2: a client may send the initialize request as a single-message JSON-RPC
  // batch ([{...}]); the SDK transport accepts that, so the wrapper must too.
  test('accepts a single-message batched initialize request (P2)', async () => {
    const probe = await StreamableHttpTestClient.create();
    client = probe;
    const res = await mcpHttpRequest(probe.port, {
      body: JSON.stringify([
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'batch-probe', version: '1.0.0' },
          },
        },
      ]),
    });
    expect(res.statusCode).toBe(200);
    expect(res.sessionId).toBeTruthy();
    const initMsg = res.messages.find((m) => m.id === 1);
    expect(initMsg).toBeDefined();
    expect(initMsg.result.serverInfo.name).toBe('wcli0');
  });

  test('tools/list returns the expected tools', async () => {
    // validate_directories is only registered when restrictWorkingDirectory is
    // on, so enable it here (mirrors the SSE tools/list coverage).
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
    const response = await client.call('tools/list');
    expect(response.error).toBeUndefined();
    const toolNames = response.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('execute_command');
    expect(toolNames).toContain('get_config');
    expect(toolNames).toContain('get_current_directory');
    expect(toolNames).toContain('set_current_directory');
    expect(toolNames).toContain('validate_directories');
  });

  test('get_config reports the active http transport', async () => {
    client = await StreamableHttpTestClient.create();
    const result = await client.callTool('get_config', {});
    const cfg = JSON.parse(result.content[0].text);
    expect(cfg.transport).toBeDefined();
    expect(cfg.transport.mode).toBe('http');
    expect(cfg.transport.httpHost).toBe('127.0.0.1');
    // httpPort is the ephemeral port the server actually bound to.
    expect(typeof cfg.transport.httpPort).toBe('number');
  });

  test('clean shutdown releases the port', async () => {
    const probe = await StreamableHttpTestClient.create();
    const port = probe.port;
    await probe.close();
    client = null;

    // A request to the closed port must fail to connect.
    await expect(
      new Promise<void>((resolve, reject) => {
        const req = http.request(
          { host: '127.0.0.1', port, path: '/mcp', method: 'GET', timeout: 2000 },
          (res) => {
            res.resume();
            res.on('end', () => resolve());
          }
        );
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy(new Error('timeout'));
        });
        req.end();
      })
    ).rejects.toThrow();
  });
});
