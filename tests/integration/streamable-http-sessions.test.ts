import { describe, test, expect, afterEach } from '@jest/globals';
import http from 'http';
import path from 'path';
import { StreamableHttpTestClient, mcpHttpRequest } from '../helpers/StreamableHttpTestClient.js';

let idCounter = 1000;

function initBody(id: number): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'sessions-test', version: '1.0.0' },
    },
  });
}

// Initialize an extra session against an already-running server and complete
// the handshake, returning its Mcp-Session-Id.
async function initSession(port: number): Promise<string> {
  const res = await mcpHttpRequest(port, { body: initBody(idCounter++) });
  if (res.statusCode !== 200 || !res.sessionId) {
    throw new Error(`init failed: ${res.statusCode} ${res.raw}`);
  }
  await mcpHttpRequest(port, {
    sessionId: res.sessionId,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  return res.sessionId;
}

async function callToolFor(
  port: number,
  sessionId: string,
  name: string,
  args: Record<string, any>
): Promise<any> {
  const id = idCounter++;
  const res = await mcpHttpRequest(port, {
    sessionId,
    body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }),
  });
  const msg = res.messages.find((m) => m.id === id);
  if (!msg) {
    throw new Error(`no response for ${name}: ${res.statusCode} ${res.raw}`);
  }
  if (msg.error) {
    throw new Error(msg.error.message);
  }
  return msg.result;
}

describe('Streamable HTTP Sessions', () => {
  let client: StreamableHttpTestClient | null = null;
  // set_current_directory calls process.chdir(); restore the original cwd after
  // each test so the WSL-emulator path (resolved from process.cwd()) and any
  // later test file in the same worker are not affected.
  const ORIGINAL_CWD = process.cwd();

  afterEach(async () => {
    if (client) {
      await client.close();
      client = null;
    }
    if (process.cwd() !== ORIGINAL_CWD) {
      process.chdir(ORIGINAL_CWD);
    }
  });

  test('two sessions on one server have isolated working directories', async () => {
    const srcDir = path.join(process.cwd(), 'src');
    // Capture the initial working-directory name up front: set_current_directory
    // calls process.chdir(), so reading process.cwd() after the set would no
    // longer reflect the server's original directory.
    const initialBasename = path.basename(process.cwd()).toLowerCase();
    client = await StreamableHttpTestClient.create({
      global: {
        security: {
          restrictWorkingDirectory: true,
          maxCommandLength: 2000,
          commandTimeout: 30,
          enableInjectionProtection: true,
        },
        paths: { allowedPaths: [process.cwd(), srcDir] },
      } as any,
    });
    const port = client.port;

    // client.session is session #1; open a second session on the same server.
    const session1 = client.session;
    const session2 = await initSession(port);
    expect(session1).not.toBe(session2);

    // Move session #1 into the src subdirectory; session #2 is untouched.
    const setResult = await callToolFor(port, session1, 'set_current_directory', { path: srcDir });
    expect(setResult.isError).toBeFalsy();

    const cwd1 = (await callToolFor(port, session1, 'get_current_directory', {})).content[0].text.trim();
    const cwd2 = (await callToolFor(port, session2, 'get_current_directory', {})).content[0].text.trim();

    expect(path.basename(cwd1).toLowerCase()).toBe('src');
    expect(cwd1).not.toBe(cwd2);
    // Session #2 still sits at the server's initial working directory, proving
    // session #1's set_current_directory did not affect it.
    expect(path.basename(cwd2).toLowerCase()).toBe(initialBasename);
  });

  test('an unknown session id returns 404', async () => {
    client = await StreamableHttpTestClient.create();
    const res = await mcpHttpRequest(client.port, {
      sessionId: 'totally-unknown-session',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(res.statusCode).toBe(404);
  });

  test('DELETE terminates a session and later requests for it return 404', async () => {
    client = await StreamableHttpTestClient.create();
    const port = client.port;
    const session = client.session;

    const del = await client.terminate();
    expect(del.statusCode).toBeGreaterThanOrEqual(200);
    expect(del.statusCode).toBeLessThan(300);

    const after = await mcpHttpRequest(port, {
      sessionId: session,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    });
    expect(after.statusCode).toBe(404);
  });

  test('a malformed JSON body returns 400 and keeps the session usable', async () => {
    client = await StreamableHttpTestClient.create();
    const bad = await mcpHttpRequest(client.port, {
      sessionId: client.session,
      headers: { 'Content-Type': 'application/json' },
      body: '{ this is not valid json',
    });
    expect(bad.statusCode).toBe(400);

    // The session must still work after the bad request.
    const list = await client.call('tools/list');
    expect(list.result).toBeDefined();
    expect(Array.isArray(list.result.tools)).toBe(true);
  });

  test('initialize requests that abort immediately do not wedge the server', async () => {
    client = await StreamableHttpTestClient.create();
    const port = client.port;

    // Fire several initialize POSTs and abort each socket immediately. The
    // onclose-before-connect cleanup must prevent a leaked/wedged session.
    for (let i = 0; i < 5; i++) {
      await new Promise<void>((resolve) => {
        const req = http.request({
          host: '127.0.0.1',
          port,
          path: '/mcp',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
        });
        req.on('error', () => resolve());
        req.write(initBody(2000 + i));
        req.destroy();
        resolve();
      });
    }

    // The server must still accept a fresh, fully working session.
    const fresh = await mcpHttpRequest(port, { body: initBody(99) });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.sessionId).toBeTruthy();
  });
});
