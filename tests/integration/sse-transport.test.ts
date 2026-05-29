import { describe, it, expect, afterEach } from '@jest/globals';
import http from 'http';
import { createSseServer, closeSseServer } from '../../src/utils/transport.js';

describe('SSE Transport Module', () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (server) {
      await closeSseServer(server);
      server = null;
    }
  });

  // Minimal MCP Server stub for testing
  function createMockMcpServer() {
    return {
      connect: async () => {},
      close: async () => {},
    } as any;
  }

  describe('createSseServer', () => {
    it('should create an HTTP server that listens', async () => {
      server = await createSseServer(createMockMcpServer(), '127.0.0.1', 0);
      expect(server).toBeDefined();
      expect(server.listening).toBe(true);
    });

    it('should return SSE headers on GET /sse', async () => {
      server = await createSseServer(createMockMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;

      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        http.get(`http://127.0.0.1:${addr.port}/sse`, resolve).on('error', reject);
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/event-stream/);
      response.destroy();
    });

    it('should return 404 for unknown paths', async () => {
      server = await createSseServer(createMockMcpServer(), '127.0.0.1', 0);
      const addr = server.address() as http.AddressInfo;

      const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
        http.get(`http://127.0.0.1:${addr.port}/unknown`, resolve).on('error', reject);
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for POST /messages without sessionId', async () => {
      server = await createSseServer(createMockMcpServer(), '127.0.0.1', 0);
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
      server = await createSseServer(createMockMcpServer(), '127.0.0.1', 0);
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
      server = await createSseServer(createMockMcpServer(), '127.0.0.1', 0);
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
