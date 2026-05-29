import { describe, test, expect, afterEach } from '@jest/globals';
import http from 'http';
import { SseTestClient } from '../helpers/SseTestClient.js';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';

// --- Raw HTTP helpers (lower-level than SseTestClient, needed to drive
// disconnect/reconnect and malformed-input scenarios that the client helper
// intentionally hides). ---

function startSseServer(): Promise<{ cliServer: CLIServer; port: number }> {
  const config: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  config.transport = { mode: 'sse', sseHost: '127.0.0.1', ssePort: 0 };
  config.global.security.restrictWorkingDirectory = false;
  const cliServer = new CLIServer(config);
  return cliServer.run().then(() => {
    const httpServer = (cliServer as any).httpServer as http.Server;
    const addr = httpServer.address() as http.AddressInfo;
    return { cliServer, port: addr.port };
  });
}

function openSseStream(
  port: number
): Promise<{ sessionId: string; stream: http.IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/sse`, (stream) => {
      let buffer = '';
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          stream.destroy();
          reject(new Error('Timed out waiting for endpoint event'));
        }
      }, 5000);

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const match = buffer.match(/data: \/messages\?sessionId=([^\s\n]+)/);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ sessionId: match[1], stream });
        }
      });

      stream.on('error', (err) => {
        clearTimeout(timeout);
        if (!resolved) reject(err);
      });
    });
    req.on('error', reject);
  });
}

function rawPost(
  port: number,
  sessionId: string,
  body: string,
  contentType = 'application/json'
): Promise<{ statusCode: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${port}/messages?sessionId=${sessionId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function initBody(id = 1): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
  });
}

function notificationBody(): string {
  return JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('SSE Edge Cases (client helper)', () => {
  let client: SseTestClient | null = null;

  afterEach(async () => {
    if (client) {
      await client.close();
      client = null;
    }
  });

  test('handles multiple concurrent requests on a single session (gap #5)', async () => {
    client = await SseTestClient.create();
    const [r1, r2, r3, r4, r5] = await Promise.all([
      client.callTool('execute_command', { shell: 'wsl', command: 'echo first' }),
      client.callTool('execute_command', { shell: 'wsl', command: 'echo second' }),
      client.callTool('execute_command', { shell: 'wsl', command: 'echo third' }),
      client.callTool('execute_command', { shell: 'wsl', command: 'echo fourth' }),
      client.callTool('execute_command', { shell: 'wsl', command: 'echo fifth' }),
    ]);
    expect(r1.content[0].text).toContain('first');
    expect(r2.content[0].text).toContain('second');
    expect(r3.content[0].text).toContain('third');
    expect(r4.content[0].text).toContain('fourth');
    expect(r5.content[0].text).toContain('fifth');
  }, 20000);

  test('delivers a large command output over SSE without truncation (gap #7)', async () => {
    client = await SseTestClient.create();
    // maxOutputLines is set above the line count so the full large payload is
    // returned untruncated, exercising a large single SSE frame end to end.
    const result = await client.callTool('execute_command', {
      shell: 'wsl',
      command: 'seq 1 2000',
      maxOutputLines: 5000,
    });
    const meta = result.metadata as any;
    expect(meta.totalLines).toBeGreaterThanOrEqual(2000);
    expect(meta.returnedLines).toBe(meta.totalLines);
    expect(meta.wasTruncated).toBe(false);
    // Spot-check that content from across the large payload survived transit.
    expect(result.content[0].text).toContain('2000');
    expect(result.content[0].text).toContain('1000');
  }, 20000);
});

describe('SSE Edge Cases (raw HTTP)', () => {
  let cliServer: CLIServer | null = null;
  const openStreams: http.IncomingMessage[] = [];

  afterEach(async () => {
    for (const stream of openStreams) {
      stream.destroy();
    }
    openStreams.length = 0;
    if (cliServer) {
      await (cliServer as any).cleanup();
      cliServer = null;
    }
  });

  test('malformed JSON body returns 400 and keeps the session usable (gap #8)', async () => {
    const started = await startSseServer();
    cliServer = started.cliServer;
    const { sessionId, stream } = await openSseStream(started.port);
    openStreams.push(stream);

    const bad = await rawPost(started.port, sessionId, 'this is not valid json {{{');
    expect(bad.statusCode).toBe(400);

    // The connection survives a malformed message: a valid request is accepted.
    const good = await rawPost(started.port, sessionId, initBody());
    expect(good.statusCode).toBe(202);
  });

  test('valid JSON that is not a JSON-RPC message returns 400 (gap #8)', async () => {
    const started = await startSseServer();
    cliServer = started.cliServer;
    const { sessionId, stream } = await openSseStream(started.port);
    openStreams.push(stream);

    const resp = await rawPost(
      started.port,
      sessionId,
      JSON.stringify({ not: 'a json-rpc message' })
    );
    expect(resp.statusCode).toBe(400);
  });

  test('non-JSON content-type returns 400 (gap #8)', async () => {
    const started = await startSseServer();
    cliServer = started.cliServer;
    const { sessionId, stream } = await openSseStream(started.port);
    openStreams.push(stream);

    const resp = await rawPost(started.port, sessionId, initBody(), 'text/plain');
    expect(resp.statusCode).toBe(400);
  });

  test('cleans up the session when the client disconnects (gap #6)', async () => {
    const started = await startSseServer();
    cliServer = started.cliServer;
    const { sessionId, stream } = await openSseStream(started.port);

    // The session is live: a POST is accepted (not 404).
    const before = await rawPost(started.port, sessionId, initBody());
    expect(before.statusCode).toBe(202);

    // Disconnect the client. The server removes the session on the SSE
    // 'close' event; poll a notification (no reply expected) until gone.
    stream.destroy();

    let status: number | undefined = before.statusCode;
    for (let i = 0; i < 60; i++) {
      await delay(50);
      const resp = await rawPost(started.port, sessionId, notificationBody());
      status = resp.statusCode;
      if (status === 404) break;
    }
    expect(status).toBe(404);
  }, 15000);

  test('allows reconnecting with a fresh session after disconnect (gap #6)', async () => {
    const started = await startSseServer();
    cliServer = started.cliServer;

    const first = await openSseStream(started.port);
    const firstSession = first.sessionId;
    first.stream.destroy();

    const second = await openSseStream(started.port);
    openStreams.push(second.stream);

    expect(second.sessionId).not.toBe(firstSession);

    // The fresh session accepts an initialize handshake.
    const resp = await rawPost(started.port, second.sessionId, initBody());
    expect(resp.statusCode).toBe(202);
  }, 15000);
});
