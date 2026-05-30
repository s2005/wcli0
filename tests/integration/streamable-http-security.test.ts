import { describe, test, expect, afterEach } from '@jest/globals';
import net from 'net';
import { StreamableHttpTestClient, mcpHttpRequest } from '../helpers/StreamableHttpTestClient.js';

// Send a raw HTTP request over a TCP socket so a deliberately malformed Host
// header reaches the server (the http client would reject it before sending).
function rawRequest(port: number, raw: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(raw));
    let data = '';
    socket.setTimeout(3000);
    socket.on('data', (chunk) => {
      data += chunk.toString();
    });
    socket.on('close', () => resolve(data));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(data);
    });
    socket.on('error', reject);
  });
}

function initBody(id = 1): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'security-test', version: '1.0.0' },
    },
  });
}

describe('Streamable HTTP Security', () => {
  let client: StreamableHttpTestClient | null = null;

  afterEach(async () => {
    if (client) {
      await client.close();
      client = null;
    }
  });

  test('rejects a request from an untrusted Origin with 403', async () => {
    client = await StreamableHttpTestClient.create();
    const res = await mcpHttpRequest(client.port, {
      headers: { Origin: 'https://evil.example' },
      body: initBody(),
    });
    expect(res.statusCode).toBe(403);
  });

  test('allows a request with no Origin header (non-browser client)', async () => {
    client = await StreamableHttpTestClient.create();
    const res = await mcpHttpRequest(client.port, { body: initBody() });
    expect(res.statusCode).toBe(200);
    expect(res.sessionId).toBeTruthy();
  });

  test('allows a loopback Origin and echoes CORS headers', async () => {
    client = await StreamableHttpTestClient.create();
    const res = await mcpHttpRequest(client.port, {
      headers: { Origin: 'http://localhost:5173' },
      body: initBody(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['vary']).toMatch(/Origin/i);
    expect(res.headers['access-control-expose-headers']).toMatch(/Mcp-Session-Id/i);
  });

  test('admits an explicitly configured allowed origin with CORS headers', async () => {
    client = await StreamableHttpTestClient.create({
      transport: {
        mode: 'http',
        sseHost: '127.0.0.1',
        ssePort: 0,
        httpHost: '127.0.0.1',
        httpPort: 0,
        httpAllowedOrigins: ['https://app.example.com'],
      },
    });
    const res = await mcpHttpRequest(client.port, {
      headers: { Origin: 'https://app.example.com' },
      body: initBody(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://app.example.com');
  });

  test('answers an OPTIONS preflight from an allowed origin with 204 and CORS', async () => {
    client = await StreamableHttpTestClient.create();
    const res = await mcpHttpRequest(client.port, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
    expect(res.headers['access-control-allow-methods']).toMatch(/DELETE/);
  });

  // P1: browser clients send Mcp-Protocol-Version on every post-initialize
  // request, so the preflight must advertise it or the browser blocks them.
  test('preflight allows the Mcp-Protocol-Version header (P1)', async () => {
    client = await StreamableHttpTestClient.create();
    const res = await mcpHttpRequest(client.port, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, mcp-session-id, mcp-protocol-version',
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-headers']).toMatch(/Mcp-Protocol-Version/i);
  });

  test('rejects an OPTIONS preflight from an untrusted origin with 403', async () => {
    client = await StreamableHttpTestClient.create();
    const res = await mcpHttpRequest(client.port, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(403);
  });

  test('returns 400 for a malformed Host header and stays alive', async () => {
    client = await StreamableHttpTestClient.create();
    const port = client.port;

    const response = await rawRequest(
      port,
      'POST /mcp HTTP/1.1\r\nHost: %%%%\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
    );
    expect(response).toMatch(/^HTTP\/1\.1 400/);

    // The server must still serve valid requests after the malformed one.
    const ok = await mcpHttpRequest(port, { body: initBody(2) });
    expect(ok.statusCode).toBe(200);
    expect(ok.sessionId).toBeTruthy();
  });

  test('returns 404 for a POST with an unknown session id', async () => {
    client = await StreamableHttpTestClient.create();
    const res = await mcpHttpRequest(client.port, {
      sessionId: 'nonexistent-session-id',
      body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list', params: {} }),
    });
    expect(res.statusCode).toBe(404);
  });
});
