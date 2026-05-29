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
