import http from 'http';
import path from 'path';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';
import { closeSseServer } from '../../src/utils/transport.js';

let nextId = 1;

export class SseTestClient {
  private cliServer: CLIServer;
  private httpServer: http.Server;
  private sessionId: string;
  private messages: any[] = [];
  private stream: http.IncomingMessage;
  private buffer = '';

  private constructor(
    cliServer: CLIServer,
    httpServer: http.Server,
    sessionId: string,
    stream: http.IncomingMessage,
    messages: any[]
  ) {
    this.cliServer = cliServer;
    this.httpServer = httpServer;
    this.sessionId = sessionId;
    this.stream = stream;
    this.messages = messages;
  }

  static async create(configOverrides: Partial<ServerConfig> = {}): Promise<SseTestClient> {
    const config: ServerConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    config.transport = { mode: 'sse', sseHost: '127.0.0.1', ssePort: 0 };
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

    const { sessionId, messages, stream } = await connectSSE(addr.port);

    // Perform MCP initialize handshake
    const initResult = await postMessage(addr.port, sessionId, {
      jsonrpc: '2.0',
      id: nextId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    });

    if (initResult.statusCode !== 202) {
      stream.destroy();
      await closeSseServer(httpServer);
      throw new Error(`Initialize failed with status ${initResult.statusCode}`);
    }

    await waitForMessage(messages, (m: any) => m.result?.serverInfo);

    // Send initialized notification
    await postMessage(addr.port, sessionId, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    const client = new SseTestClient(cliServer, httpServer, sessionId, stream, messages);

    // Continue collecting messages on the stream
    stream.on('data', () => {
      client.parseMessagesFromBuffer();
    });

    return client;
  }

  async call(method: string, params?: object): Promise<any> {
    const id = nextId++;
    const port = (this.httpServer.address() as http.AddressInfo).port;
    await postMessage(port, this.sessionId, {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    });
    return waitForMessage(this.messages, (m: any) => m.id === id);
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    const response = await this.call('tools/call', { name, arguments: args });
    if (response.error) {
      throw new Error(`Tool call error: ${response.error.message}`);
    }
    return response.result;
  }

  async close(): Promise<void> {
    this.stream.destroy();
    await closeSseServer(this.httpServer);
  }

  get port(): number {
    return (this.httpServer.address() as http.AddressInfo).port;
  }

  private parseMessagesFromBuffer() {
    const parts = this.buffer.split('\n\n');
    for (const part of parts) {
      const dataMatch = part.match(/^data: (.+)$/m);
      const eventMatch = part.match(/^event: (.+)$/m);
      if (dataMatch && eventMatch && eventMatch[1] === 'message') {
        try {
          const parsed = JSON.parse(dataMatch[1]);
          if (!this.messages.some((m) => JSON.stringify(m) === JSON.stringify(parsed))) {
            this.messages.push(parsed);
          }
        } catch {
          // ignore non-JSON data
        }
      }
    }
  }
}

function connectSSE(
  port: number
): Promise<{ sessionId: string; messages: any[]; stream: http.IncomingMessage }> {
  const messages: any[] = [];
  let buffer = '';

  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/sse`, (stream) => {
      let sessionId: string | undefined;
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          stream.destroy();
          reject(new Error('Timed out waiting for endpoint event'));
        }
      }, 5000);

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();

        if (!sessionId) {
          const endpointMatch = buffer.match(/data: \/messages\?sessionId=([^\s\n]+)/);
          if (endpointMatch) {
            sessionId = endpointMatch[1];
          }
        }

        // Parse message events
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

        if (sessionId && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ sessionId, messages, stream });
        }
      });

      stream.on('error', (err) => {
        clearTimeout(timeout);
        if (!resolved) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
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
      clearInterval(check);
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
