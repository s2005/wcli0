import { describe, it, expect, afterEach } from '@jest/globals';
import http from 'http';
import { createSseServer, closeSseServer } from '../../src/utils/transport.js';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

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
      server = await createSseServer(createTestMcpServer(), '127.0.0.1', 0);
      expect(server).toBeDefined();
      expect(server.listening).toBe(true);
    });

    it('should return SSE headers on GET /sse', async () => {
      server = await createSseServer(createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;

      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        http.get(`http://127.0.0.1:${addr.port}/sse`, resolve).on('error', reject);
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/event-stream/);
      response.destroy();
    });

    it('should return 404 for unknown paths', async () => {
      server = await createSseServer(createTestMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;

      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        http.get(`http://127.0.0.1:${addr.port}/unknown`, resolve).on('error', reject);
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for POST /messages without sessionId', async () => {
      server = await createSseServer(createTestMcpServer(), '127.0.0.1', 0);
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
      server = await createSseServer(createTestMcpServer(), '127.0.0.1', 0);
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
  });

  describe('closeSseServer', () => {
    it('should close a listening server', async () => {
      server = await createSseServer(createTestMcpServer(), '127.0.0.1', 0);
      expect(server.listening).toBe(true);
      await closeSseServer(server);
      expect(server.listening).toBe(false);
      server = null;
    });

    it('should handle closing a non-listening server', async () => {
      const closedServer = http.createServer();
      await expect(closeSseServer(closedServer)).resolves.toBeUndefined();
    });
  });
});

describe('CLIServer SSE Integration', () => {
  let cliServer: CLIServer | null = null;
  let httpServer: http.Server | null = null;

  afterEach(async () => {
    if (cliServer) {
      const internalServer = (cliServer as any).httpServer as http.Server | undefined;
      if (internalServer) {
        await closeSseServer(internalServer);
      }
    }
    if (httpServer) {
      await closeSseServer(httpServer);
      httpServer = null;
    }
    cliServer = null;
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
  let cliServer: CLIServer | null = null;

  afterEach(async () => {
    if (cliServer) {
      const internalServer = (cliServer as any).httpServer as http.Server | undefined;
      if (internalServer) {
        await closeSseServer(internalServer);
      }
    }
    cliServer = null;
  });

  function makeSseConfig(): ServerConfig {
    const config: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    config.transport = { mode: 'sse', sseHost: '127.0.0.1', ssePort: 0 };
    config.global.security.restrictWorkingDirectory = false;
    return config;
  }

  async function connectSSE(
    port: number
  ): Promise<{ sessionId: string; messages: any[]; stream: http.IncomingMessage }> {
    const messages: any[] = [];
    let buffer = '';

    const stream = await new Promise<http.IncomingMessage>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/sse`, resolve).on('error', reject);
    });

    const sessionId = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        stream.destroy();
        reject(new Error('Timed out waiting for endpoint event'));
      }, 5000);

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();

        // Parse endpoint event
        const endpointMatch = buffer.match(/data: \/messages\?sessionId=([^\s\n]+)/);
        if (endpointMatch) {
          clearTimeout(timeout);
          resolve(endpointMatch[1]);
        }

        // Parse message events
        parseMessagesFromBuffer();
      });
      stream.on('error', reject);
    });

    function parseMessagesFromBuffer() {
      const parts = buffer.split('\n\n');
      for (const part of parts) {
        const dataMatch = part.match(/^data: (.+)$/m);
        const eventMatch = part.match(/^event: (.+)$/m);
        if (dataMatch && eventMatch && eventMatch[1] === 'message') {
          try {
            const parsed = JSON.parse(dataMatch[1]);
            if (!messages.some((m) => JSON.stringify(m) === JSON.stringify(parsed))) {
              messages.push(parsed);
            }
          } catch {
            // ignore non-JSON data
          }
        }
      }
    }

    return { sessionId, messages, stream };
  }

  function postMessage(
    port: number,
    sessionId: string,
    message: object
  ): Promise<{ statusCode: number | undefined; body: string }> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(message);
      const req = http.request(
        `http://127.0.0.1:${port}/messages?sessionId=${sessionId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => { resolve({ statusCode: res.statusCode, body: data }); });
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  function waitForMessage(messages: any[], predicate: (m: any) => boolean, timeoutMs = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const found = messages.find(predicate);
      if (found) { resolve(found); return; }

      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for message. Collected: ${JSON.stringify(messages)}`));
      }, timeoutMs);

      const check = setInterval(() => {
        const m = messages.find(predicate);
        if (m) {
          clearTimeout(timer);
          clearInterval(check);
          resolve(m);
        }
      }, 50);
    });
  }

  it('should complete MCP initialize handshake over SSE', async () => {
    const config = makeSseConfig();
    cliServer = new CLIServer(config);
    await cliServer.run();

    const internalServer = (cliServer as any).httpServer as http.Server;
    const addr = internalServer.address() as http.AddressInfo;
    const { sessionId, messages, stream } = await connectSSE(addr.port);

    expect(sessionId).toMatch(/^[0-9a-f-]+$/);

    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    };

    const postResult = await postMessage(addr.port, sessionId, initRequest);
    expect(postResult.statusCode).toBe(202);

    const response = await waitForMessage(messages, (m) => m.id === 1);
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result).toBeDefined();
    expect(response.result.serverInfo).toBeDefined();
    expect(response.result.serverInfo.name).toBe('wcli0');
    expect(response.result.capabilities).toBeDefined();

    stream.destroy();
  });

  it('should handle initialized notification over SSE', async () => {
    const config = makeSseConfig();
    cliServer = new CLIServer(config);
    await cliServer.run();

    const internalServer = (cliServer as any).httpServer as http.Server;
    const addr = internalServer.address() as http.AddressInfo;
    const { sessionId, messages, stream } = await connectSSE(addr.port);

    // Initialize first
    await postMessage(addr.port, sessionId, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });
    await waitForMessage(messages, (m) => m.id === 1);

    // Send initialized notification (no id = notification)
    const postResult = await postMessage(addr.port, sessionId, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(postResult.statusCode).toBe(202);

    stream.destroy();
  });

  it('should list tools over SSE after initialization', async () => {
    const config = makeSseConfig();
    cliServer = new CLIServer(config);
    await cliServer.run();

    const internalServer = (cliServer as any).httpServer as http.Server;
    const addr = internalServer.address() as http.AddressInfo;
    const { sessionId, messages, stream } = await connectSSE(addr.port);

    // Initialize
    await postMessage(addr.port, sessionId, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });
    await waitForMessage(messages, (m) => m.id === 1);

    // Send initialized notification
    await postMessage(addr.port, sessionId, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    // List tools
    await postMessage(addr.port, sessionId, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    const response = await waitForMessage(messages, (m) => m.id === 2);
    expect(response.result).toBeDefined();
    expect(response.result.tools).toBeDefined();
    expect(Array.isArray(response.result.tools)).toBe(true);
    const toolNames = response.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('execute_command');
    expect(toolNames).toContain('get_config');

    stream.destroy();
  });

  it('should call get_config tool over SSE and return valid config', async () => {
    const config = makeSseConfig();
    cliServer = new CLIServer(config);
    await cliServer.run();

    const internalServer = (cliServer as any).httpServer as http.Server;
    const addr = internalServer.address() as http.AddressInfo;
    const { sessionId, messages, stream } = await connectSSE(addr.port);

    // Initialize
    await postMessage(addr.port, sessionId, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });
    await waitForMessage(messages, (m) => m.id === 1);

    // Initialized notification
    await postMessage(addr.port, sessionId, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    // Call get_config tool
    await postMessage(addr.port, sessionId, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_config',
        arguments: {},
      },
    });

    const response = await waitForMessage(messages, (m) => m.id === 3);
    expect(response.result).toBeDefined();
    expect(response.result.content).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
    const cfg = JSON.parse(response.result.content[0].text);
    expect(cfg).toHaveProperty('global');
    expect(cfg.global).toHaveProperty('security');

    stream.destroy();
  });

  it('should reject POST to unknown session', async () => {
    const config = makeSseConfig();
    cliServer = new CLIServer(config);
    await cliServer.run();

    const internalServer = (cliServer as any).httpServer as http.Server;
    const addr = internalServer.address() as http.AddressInfo;

    const result = await postMessage(addr.port, 'nonexistent-session-id', {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });
    expect(result.statusCode).toBe(404);
  });

  it('should handle multiple concurrent SSE sessions with separate servers', async () => {
    // The MCP SDK Server only supports one transport at a time, so each
    // SSE session needs its own CLIServer/HTTP server. This test verifies
    // two independent SSE servers can run concurrently.
    const config1 = makeSseConfig();
    const config2 = makeSseConfig();
    const server1 = new CLIServer(config1);
    const server2 = new CLIServer(config2);
    await server1.run();
    await server2.run();

    const httpServer1 = (server1 as any).httpServer as http.Server;
    const httpServer2 = (server2 as any).httpServer as http.Server;
    const addr1 = httpServer1.address() as http.AddressInfo;
    const addr2 = httpServer2.address() as http.AddressInfo;

    const session1 = await connectSSE(addr1.port);
    const session2 = await connectSSE(addr2.port);

    const initReq = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    };

    await postMessage(addr1.port, session1.sessionId, initReq);
    await postMessage(addr2.port, session2.sessionId, initReq);

    const resp1 = await waitForMessage(session1.messages, (m) => m.id === 1);
    const resp2 = await waitForMessage(session2.messages, (m) => m.id === 1);

    expect(resp1.result.serverInfo.name).toBe('wcli0');
    expect(resp2.result.serverInfo.name).toBe('wcli0');

    session1.stream.destroy();
    session2.stream.destroy();
    await closeSseServer(httpServer1);
    await closeSseServer(httpServer2);
  }, 20000);
});
