import http from 'http';
import path from 'path';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';
import { closeHttpServer } from '../../src/utils/httpShared.js';

let nextId = 1;

export interface McpHttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  sessionId?: string;
  /** JSON-RPC messages parsed from the response (SSE `message` events or a JSON body). */
  messages: any[];
  /** Raw response body. */
  raw: string;
}

/**
 * Low-level request helper for the Streamable HTTP `/mcp` endpoint. Sends a
 * single request and resolves with the status, headers, captured
 * `Mcp-Session-Id`, and any JSON-RPC messages parsed from the response (the
 * server answers a POST with an SSE stream by default, or a JSON body when
 * `enableJsonResponse` is set).
 */
export function mcpHttpRequest(
  port: number,
  options: {
    method?: string;
    sessionId?: string;
    headers?: Record<string, string>;
    body?: string;
    path?: string;
    host?: string;
  } = {}
): Promise<McpHttpResponse> {
  const method = options.method ?? 'POST';
  const headers: Record<string, string> = {
    Accept: 'application/json, text/event-stream',
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.sessionId ? { 'Mcp-Session-Id': options.sessionId } : {}),
    ...(options.headers ?? {})
  };
  if (options.body !== undefined) {
    headers['Content-Length'] = String(Buffer.byteLength(options.body));
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: options.host ?? '127.0.0.1',
        port,
        path: options.path ?? '/mcp',
        method,
        headers
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            sessionId: res.headers['mcp-session-id'] as string | undefined,
            messages: parseMcpBody(res.headers['content-type'], raw),
            raw
          });
        });
      }
    );
    req.on('error', reject);
    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
  });
}

/** Parse JSON-RPC messages from either an SSE response stream or a JSON body. */
function parseMcpBody(contentType: string | undefined, raw: string): any[] {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return [];
  }
  if (contentType && contentType.includes('text/event-stream')) {
    const messages: any[] = [];
    for (const block of trimmed.split('\n\n')) {
      const dataLines = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice('data:'.length).trim());
      if (dataLines.length === 0) {
        continue;
      }
      try {
        messages.push(JSON.parse(dataLines.join('\n')));
      } catch {
        // ignore non-JSON data lines (e.g. SSE comments)
      }
    }
    return messages;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

/**
 * Test client for the Streamable HTTP transport. Starts a CLIServer in `http`
 * mode on an ephemeral port (mirroring SseTestClient's WSL-emulator setup),
 * performs the initialize handshake, captures the `Mcp-Session-Id`, and exposes
 * `call()` / `callTool()` that POST with the session header and parse the
 * JSON-or-SSE response. `close()` calls the server's cleanup().
 */
export class StreamableHttpTestClient {
  private cliServer: CLIServer;
  private httpServer: http.Server;
  private sessionId: string;

  private constructor(cliServer: CLIServer, httpServer: http.Server, sessionId: string) {
    this.cliServer = cliServer;
    this.httpServer = httpServer;
    this.sessionId = sessionId;
  }

  static async create(configOverrides: Partial<ServerConfig> = {}): Promise<StreamableHttpTestClient> {
    const config: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    config.transport = { mode: 'http', sseHost: '127.0.0.1', ssePort: 0, httpHost: '127.0.0.1', httpPort: 0 };
    config.global.security.restrictWorkingDirectory = false;

    // Set up WSL emulator for cross-platform testing
    const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl-emulator.js');
    config.shells.wsl = {
      type: 'wsl',
      enabled: true,
      executable: {
        command: process.execPath,
        args: [wslEmulatorPath, '-e'],
      },
      overrides: {
        restrictions: { blockedOperators: ['&', '|', ';', '`'] },
      },
      wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true },
    };

    // Disable non-WSL shells for cross-platform reliability
    if (config.shells.powershell) config.shells.powershell.enabled = false;
    if (config.shells.cmd) config.shells.cmd.enabled = false;
    if (config.shells.gitbash) config.shells.gitbash.enabled = false;
    if (config.shells.bash) config.shells.bash.enabled = false;

    // Allow -e argument for the emulator
    config.global.restrictions.blockedArguments =
      (config.global.restrictions.blockedArguments || []).filter((a) => a !== '-e');

    // Apply overrides deeply
    if (configOverrides.global) {
      if (configOverrides.global.security) {
        Object.assign(config.global.security, configOverrides.global.security);
      }
      if (configOverrides.global.restrictions) {
        Object.assign(config.global.restrictions, configOverrides.global.restrictions);
      }
      if (configOverrides.global.paths) {
        Object.assign(config.global.paths, configOverrides.global.paths);
      }
    }
    if (configOverrides.shells) {
      Object.assign(config.shells, configOverrides.shells);
    }
    if (configOverrides.transport) {
      config.transport = configOverrides.transport;
    }

    const cliServer = new CLIServer(config);
    await cliServer.run();

    const httpServer = (cliServer as any).httpServer as http.Server;
    const addr = httpServer.address() as http.AddressInfo;

    // Initialize handshake: POST /mcp with no session id; the server assigns one.
    const initRes = await mcpHttpRequest(addr.port, {
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'streamable-test-client', version: '1.0.0' },
        },
      }),
    });

    if (initRes.statusCode !== 200 || !initRes.sessionId) {
      await closeHttpServer(httpServer);
      throw new Error(
        `Initialize failed: status ${initRes.statusCode}, session ${initRes.sessionId}, body ${initRes.raw}`
      );
    }

    const sessionId = initRes.sessionId;

    // Complete the handshake with the initialized notification.
    await mcpHttpRequest(addr.port, {
      sessionId,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });

    return new StreamableHttpTestClient(cliServer, httpServer, sessionId);
  }

  /** Send a JSON-RPC request and return the response object with the matching id. */
  async call(method: string, params?: object): Promise<any> {
    const id = nextId++;
    const res = await mcpHttpRequest(this.port, {
      sessionId: this.sessionId,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        ...(params !== undefined ? { params } : {}),
      }),
    });
    const message = res.messages.find((m) => m.id === id);
    if (!message) {
      throw new Error(
        `No response for ${method} (id ${id}); status ${res.statusCode}, body ${res.raw}`
      );
    }
    return message;
  }

  /** Call a tool and return its result, throwing on a JSON-RPC error. */
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    const response = await this.call('tools/call', { name, arguments: args });
    if (response.error) {
      throw new Error(`Tool call error: ${response.error.message}`);
    }
    return response.result;
  }

  /** Terminate this session via DELETE /mcp. */
  async terminate(): Promise<McpHttpResponse> {
    return mcpHttpRequest(this.port, { method: 'DELETE', sessionId: this.sessionId });
  }

  async close(): Promise<void> {
    await (this.cliServer as any).cleanup();
  }

  get port(): number {
    return (this.httpServer.address() as http.AddressInfo).port;
  }

  get session(): string {
    return this.sessionId;
  }

  get server(): http.Server {
    return this.httpServer;
  }
}
