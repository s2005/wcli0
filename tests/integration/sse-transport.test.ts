import { describe, it, expect, afterEach } from '@jest/globals';
import http from 'http';
import { createSseServer, closeSseServer } from '../../src/utils/transport.js';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SseTestClient } from '../helpers/SseTestClient.js';

describe('SSE Transport Module', () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await closeSseServer(server);
      server = null;
    }
  });

  function createTestMcpServer(): Server {
    return new Server({
      name: 'test-server',
      version: '1.0.0',
    }, {
      capabilities: {},
    });
  }

  describe('createSseServer', () => {
    it('should create an HTTP server that listens', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      expect(server).toBeDefined();
      expect(server.listening).toBe(true);
    });

    it('should return SSE headers on GET /sse', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;

      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        http.get(`http://127.0.0.1:${addr.port}/sse`, resolve).on('error', reject);
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/event-stream/);
      response.destroy();
    });

    it('should return 404 for unknown paths', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;

      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        http.get(`http://127.0.0.1:${addr.port}/unknown`, resolve).on('error', reject);
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for POST /messages without sessionId', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;

      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${addr.port}/messages`,
          { method: 'POST' },
          resolve
        );
        req.on('error', reject);
        req.end();
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for POST /messages with non-existent session', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;

      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${addr.port}/messages?sessionId=fake-session-id`,
          { method: 'POST' },
          resolve
        );
        req.on('error', reject);
        req.setHeader('Content-Type', 'application/json');
        req.end(JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 }));
      });

      expect(response.statusCode).toBe(404);
    });

    // P1: each SSE connection must get its own MCP server instance, because the
    // MCP Protocol owns a single transport at a time (connect() overwrites it).
    it('creates a fresh MCP server per SSE connection (P1)', async () => {
      let factoryCalls = 0;
      const created: Server[] = [];
      server = await createSseServer(
        () => {
          factoryCalls++;
          const s = createTestMcpServer();
          created.push(s);
          return s;
        },
        '127.0.0.1',
        0
      );
      const addr = server.address() as http.AddressInfo;

      const open = (): Promise<http.IncomingMessage> =>
        new Promise((resolve, reject) => {
          http.get(`http://127.0.0.1:${addr.port}/sse`, resolve).on('error', reject);
        });

      const r1 = await open();
      const r2 = await open();

      expect(factoryCalls).toBe(2);
      expect(created[0]).not.toBe(created[1]);

      r1.destroy();
      r2.destroy();
    });

    // P5: a malformed Host header makes `new URL()` throw. Since the request
    // callback is async that would become an unhandled rejection and crash the
    // process; the server must return 400 and keep serving instead.
    it('returns 400 for a malformed Host header and stays alive (P5)', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;

      const badStatus = await new Promise<number | undefined>((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port: addr.port,
            path: '/sse',
            method: 'GET',
            headers: { Host: '%%%%' },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          }
        );
        req.on('error', reject);
        req.end();
      });
      expect(badStatus).toBe(400);

      // The server survived the malformed request: a normal request still works.
      const okStatus = await new Promise<number | undefined>((resolve, reject) => {
        const r = http.get(`http://127.0.0.1:${addr.port}/unknown`, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        r.on('error', reject);
      });
      expect(okStatus).toBe(404);
    });
  });

  // P2: reject untrusted Origin headers (DNS-rebinding defense).
  describe('Origin validation (P2)', () => {
    function requestWithOrigin(
      port: number,
      pathName: string,
      method: string,
      origin?: string
    ): Promise<http.IncomingMessage> {
      return new Promise((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${port}${pathName}`,
          { method, headers: origin ? { Origin: origin } : {} },
          resolve
        );
        req.on('error', reject);
        req.end();
      });
    }

    it('rejects GET /sse from a disallowed origin with 403', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;
      const res = await requestWithOrigin(addr.port, '/sse', 'GET', 'https://evil.example');
      expect(res.statusCode).toBe(403);
      res.destroy();
    });

    it('rejects POST /messages from a disallowed origin with 403', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;
      const res = await requestWithOrigin(
        addr.port,
        '/messages?sessionId=whatever',
        'POST',
        'https://evil.example'
      );
      expect(res.statusCode).toBe(403);
      res.destroy();
    });

    it('allows GET /sse from a loopback origin', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;
      const res = await requestWithOrigin(
        addr.port,
        '/sse',
        'GET',
        `http://localhost:${addr.port}`
      );
      expect(res.statusCode).toBe(200);
      res.destroy();
    });

    it('allows GET /sse with no Origin header', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;
      const res = await requestWithOrigin(addr.port, '/sse', 'GET', undefined);
      expect(res.statusCode).toBe(200);
      res.destroy();
    });
  });

  // P8: browser clients on an allowed origin but a different port need the
  // server to echo Access-Control-Allow-Origin and to answer OPTIONS preflight.
  describe('CORS for allowed origins (P8)', () => {
    function rawRequest(
      port: number,
      pathName: string,
      method: string,
      origin?: string
    ): Promise<http.IncomingMessage> {
      return new Promise((resolve, reject) => {
        const req = http.request(
          `http://127.0.0.1:${port}${pathName}`,
          { method, headers: origin ? { Origin: origin } : {} },
          resolve
        );
        req.on('error', reject);
        req.end();
      });
    }

    it('answers an OPTIONS preflight from an allowed origin with 204 and CORS headers', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;
      const origin = `http://localhost:${addr.port}`;
      const res = await rawRequest(addr.port, '/messages?sessionId=x', 'OPTIONS', origin);
      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
      res.destroy();
    });

    it('echoes Access-Control-Allow-Origin on GET /sse for an allowed origin', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;
      const origin = `http://127.0.0.1:${addr.port}`;
      const res = await rawRequest(addr.port, '/sse', 'GET', origin);
      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      res.destroy();
    });

    it('rejects a preflight from a disallowed origin with 403 and no CORS header', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;
      const res = await rawRequest(
        addr.port,
        '/messages?sessionId=x',
        'OPTIONS',
        'https://evil.example'
      );
      expect(res.statusCode).toBe(403);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      res.destroy();
    });

    it('omits CORS headers when no Origin is present (non-browser client)', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;
      const res = await rawRequest(addr.port, '/unknown', 'GET', undefined);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      res.destroy();
    });
  });

  describe('closeSseServer', () => {
    it('should close a listening server', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      expect(server.listening).toBe(true);
      await closeSseServer(server);
      expect(server.listening).toBe(false);
      server = null;
    });

    it('should handle closing a non-listening server', async () => {
      const closedServer = http.createServer();
      await expect(closeSseServer(closedServer)).resolves.toBeUndefined();
    });

    // P6: closeAllConnections() only exists on Node >=18.2, but engines.node
    // allows 18.0/18.1 where it is undefined. With an active SSE stream,
    // close() would then hang forever; the tracked-socket fallback must still
    // tear the server down.
    it('closes with an active stream when closeAllConnections is unavailable (P6)', async () => {
      server = await createSseServer(() => createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;

      // Open a long-lived SSE stream so the server has an active socket.
      const stream = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const r = http.get(`http://127.0.0.1:${addr.port}/sse`, resolve);
        r.on('error', reject);
      });

      // Simulate a Node 18.0/18.1 runtime where the API is missing.
      (server as unknown as { closeAllConnections?: () => void }).closeAllConnections = undefined;

      await closeSseServer(server);
      expect(server.listening).toBe(false);

      stream.destroy();
      server = null;
    }, 10000);
  });
});

describe('CLIServer SSE Integration', () => {
  let cliServer: CLIServer | null = null;

  afterEach(async () => {
    if (cliServer) {
      await (cliServer as any).cleanup();
      cliServer = null;
    }
  });

  function makeSseConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
    const config: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    config.transport = { mode: 'sse', sseHost: '127.0.0.1', ssePort: 0 };
    return { ...config, ...overrides };
  }

  it('should start CLIServer in SSE mode and accept connections', async () => {
    const config = makeSseConfig();
    cliServer = new CLIServer(config);
    await cliServer.run();

    const internalServer = (cliServer as any).httpServer as http.Server;
    expect(internalServer).toBeDefined();
    expect(internalServer.listening).toBe(true);

    const addr = internalServer.address() as http.AddressInfo;
    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
      http.get(`http://127.0.0.1:${addr.port}/sse`, resolve).on('error', reject);
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/event-stream/);
    response.destroy();
  });

  it('should use stdio mode when transport is stdio', async () => {
    const config = makeSseConfig();
    config.transport = { mode: 'stdio', sseHost: '127.0.0.1', ssePort: 9444 };
    cliServer = new CLIServer(config);
    await cliServer.run();

    const internalServer = (cliServer as any).httpServer;
    expect(internalServer).toBeUndefined();
  });
});

describe('SSE MCP Protocol Integration', () => {
  let client: SseTestClient | null = null;

  afterEach(async () => {
    if (client) {
      await client.close();
      client = null;
    }
  });

  it('should complete MCP initialize handshake over SSE', async () => {
    client = await SseTestClient.create();
    const response = await client.call('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    });
    expect(response.result.serverInfo.name).toBe('wcli0');
    expect(response.result.capabilities).toBeDefined();
  });

  it('should handle initialized notification over SSE', async () => {
    client = await SseTestClient.create();
    // SseTestClient.create() already sends initialize + initialized
    // Verify by listing tools (requires completed handshake)
    const response = await client.call('tools/list');
    expect(response.result.tools).toBeDefined();
    expect(Array.isArray(response.result.tools)).toBe(true);
  });

  it('should list tools over SSE after initialization', async () => {
    client = await SseTestClient.create();
    const response = await client.call('tools/list');
    const toolNames = response.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('execute_command');
    expect(toolNames).toContain('get_config');
  });

  it('should call get_config tool over SSE and return valid config', async () => {
    client = await SseTestClient.create();
    const result = await client.callTool('get_config', {});
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    const cfg = JSON.parse(result.content[0].text as string);
    expect(cfg).toHaveProperty('global');
    expect(cfg.global).toHaveProperty('security');
  });

  it('should reject POST to unknown session', async () => {
    client = await SseTestClient.create();
    const port = client.port;

    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
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

  it('should handle multiple concurrent SSE sessions with separate servers', async () => {
    const client1 = await SseTestClient.create();
    const client2 = await SseTestClient.create();

    try {
      const [resp1, resp2] = await Promise.all([
        client1.call('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        }),
        client2.call('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        }),
      ]);

      expect(resp1.result.serverInfo.name).toBe('wcli0');
      expect(resp2.result.serverInfo.name).toBe('wcli0');
    } finally {
      await client1.close();
      await client2.close();
    }
  }, 20000);
});
