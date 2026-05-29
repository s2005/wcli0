import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import http from 'http';
import type { AddressInfo } from 'net';
import {
  DEFAULT_CONFIG,
  applyCliTransport,
  mergeConfigs,
  validateConfig
} from '../../src/utils/config.js';
import { createSerializableConfig } from '../../src/utils/configUtils.js';
import { isOriginAllowed, closeHttpServer } from '../../src/utils/httpShared.js';
import { createStreamableHttpServer } from '../../src/utils/streamableHttp.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { ServerConfig } from '../../src/types/config.js';

// Minimal request helper: performs one HTTP request and resolves with the
// status code, headers, and raw body string.
function httpRequest(
  options: http.RequestOptions,
  body?: string
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8')
        })
      );
    });
    req.on('error', reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

function cloneDefault(): ServerConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function makeConfig(): ServerConfig {
  return {
    ...DEFAULT_CONFIG,
    transport: { ...DEFAULT_CONFIG.transport! }
  };
}

describe('Streamable HTTP transport configuration', () => {
  describe('DEFAULT_CONFIG http defaults', () => {
    it('defaults httpHost to 127.0.0.1', () => {
      expect(DEFAULT_CONFIG.transport!.httpHost).toBe('127.0.0.1');
    });

    it('defaults httpPort to 9444', () => {
      expect(DEFAULT_CONFIG.transport!.httpPort).toBe(9444);
    });

    it('defaults httpAllowedOrigins to an empty array', () => {
      expect(DEFAULT_CONFIG.transport!.httpAllowedOrigins).toEqual([]);
    });
  });

  describe('config-file http values (mergeConfigs)', () => {
    it('preserves file-provided http fields and fills defaults for the rest', () => {
      const merged = mergeConfigs(DEFAULT_CONFIG, {
        transport: { mode: 'http', httpPort: 3000 } as any
      });
      expect(merged.transport).toEqual({
        mode: 'http',
        sseHost: '127.0.0.1',
        ssePort: 9444,
        sseAllowedOrigins: [],
        httpHost: '127.0.0.1',
        httpPort: 3000,
        httpAllowedOrigins: []
      });
    });
  });

  describe('applyCliTransport http overrides', () => {
    it('sets mode to http when transport=http', () => {
      const config = makeConfig();
      applyCliTransport(config, 'http');
      expect(config.transport!.mode).toBe('http');
    });

    it('overrides httpHost', () => {
      const config = makeConfig();
      applyCliTransport(config, 'http', undefined, undefined, undefined, '0.0.0.0');
      expect(config.transport!.httpHost).toBe('0.0.0.0');
    });

    it('overrides httpPort', () => {
      const config = makeConfig();
      applyCliTransport(config, 'http', undefined, undefined, undefined, undefined, 3000);
      expect(config.transport!.httpPort).toBe(3000);
    });

    it('parses comma-separated httpAllowedOrigins', () => {
      const config = makeConfig();
      applyCliTransport(
        config,
        'http',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'https://app.example.com, 192.168.1.10'
      );
      expect(config.transport!.httpAllowedOrigins).toEqual([
        'https://app.example.com',
        '192.168.1.10'
      ]);
    });

    it('applies all http CLI overrides together', () => {
      const config = makeConfig();
      applyCliTransport(
        config,
        'http',
        undefined,
        undefined,
        undefined,
        '0.0.0.0',
        3000,
        'https://app.example.com'
      );
      expect(config.transport).toEqual({
        mode: 'http',
        sseHost: '127.0.0.1',
        ssePort: 9444,
        sseAllowedOrigins: [],
        httpHost: '0.0.0.0',
        httpPort: 3000,
        httpAllowedOrigins: ['https://app.example.com']
      });
    });

    it('does not let http flags disturb the sse settings', () => {
      const config = makeConfig();
      applyCliTransport(config, 'http', undefined, undefined, undefined, '0.0.0.0', 3000);
      expect(config.transport!.sseHost).toBe('127.0.0.1');
      expect(config.transport!.ssePort).toBe(9444);
    });

    it('ignores a fractional httpPort and keeps the default', () => {
      const config = makeConfig();
      applyCliTransport(config, 'http', undefined, undefined, undefined, undefined, 9444.5);
      expect(config.transport!.httpPort).toBe(9444);
    });

    it('ignores an httpPort of 0', () => {
      const config = makeConfig();
      applyCliTransport(config, 'http', undefined, undefined, undefined, undefined, 0);
      expect(config.transport!.httpPort).toBe(9444);
    });

    it('ignores an httpPort above 65535', () => {
      const config = makeConfig();
      applyCliTransport(config, 'http', undefined, undefined, undefined, undefined, 70000);
      expect(config.transport!.httpPort).toBe(9444);
    });

    it('ignores an empty httpHost', () => {
      const config = makeConfig();
      applyCliTransport(config, 'http', undefined, undefined, undefined, '  ');
      expect(config.transport!.httpHost).toBe('127.0.0.1');
    });

    it('ignores an httpAllowedOrigins string with only blanks', () => {
      const config = makeConfig();
      config.transport!.httpAllowedOrigins = ['https://keep.example'];
      applyCliTransport(
        config,
        'http',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        ' , , '
      );
      expect(config.transport!.httpAllowedOrigins).toEqual(['https://keep.example']);
    });
  });

  describe('validateConfig http transport', () => {
    it('accepts a valid http transport', () => {
      const cfg = cloneDefault();
      cfg.transport = {
        mode: 'http',
        sseHost: '127.0.0.1',
        ssePort: 9444,
        httpHost: '0.0.0.0',
        httpPort: 3000,
        httpAllowedOrigins: ['https://app.example.com']
      };
      expect(() => validateConfig(cfg)).not.toThrow();
    });

    it('rejects a non-integer httpPort', () => {
      const cfg = cloneDefault();
      cfg.transport = {
        mode: 'http',
        sseHost: '127.0.0.1',
        ssePort: 9444,
        httpPort: 3000.5
      };
      expect(() => validateConfig(cfg)).toThrow(
        'transport.httpPort must be an integer between 1 and 65535'
      );
    });

    it('rejects an httpPort above 65535', () => {
      const cfg = cloneDefault();
      cfg.transport = {
        mode: 'http',
        sseHost: '127.0.0.1',
        ssePort: 9444,
        httpPort: 70000
      };
      expect(() => validateConfig(cfg)).toThrow(/transport\.httpPort/);
    });

    it('rejects an empty httpHost', () => {
      const cfg = cloneDefault();
      cfg.transport = {
        mode: 'http',
        sseHost: '127.0.0.1',
        ssePort: 9444,
        httpHost: '   '
      };
      expect(() => validateConfig(cfg)).toThrow('transport.httpHost must be a non-empty string');
    });

    it('rejects httpAllowedOrigins that is not an array of non-empty strings', () => {
      const cfg = cloneDefault();
      cfg.transport = {
        mode: 'http',
        sseHost: '127.0.0.1',
        ssePort: 9444,
        httpAllowedOrigins: ['ok', ''] as any
      };
      expect(() => validateConfig(cfg)).toThrow(
        'transport.httpAllowedOrigins must be an array of non-empty strings'
      );
    });
  });

  describe('createSerializableConfig reports the active http bind settings', () => {
    it('includes httpHost and httpPort for an http-mode config', () => {
      const cfg = cloneDefault();
      cfg.transport = {
        mode: 'http',
        sseHost: '127.0.0.1',
        ssePort: 9444,
        httpHost: '0.0.0.0',
        httpPort: 3000,
        httpAllowedOrigins: []
      };
      const safe = createSerializableConfig(cfg);
      expect(safe.transport).toEqual({
        mode: 'http',
        sseHost: '127.0.0.1',
        ssePort: 9444,
        httpHost: '0.0.0.0',
        httpPort: 3000
      });
    });
  });
});

// Mirror the transport-related options declared by parseArgs() in src/index.ts
// so the CLI flag wiring (choices + new http flags) is exercised without
// exporting the private parseArgs. The option declarations here must stay in
// sync with src/index.ts.
async function parseTransportArgs(args: string[]): Promise<any> {
  const yargs = (await import('yargs/yargs')).default;
  const { hideBin } = await import('yargs/helpers');

  const originalArgv = process.argv;
  process.argv = ['node', 'test.js', ...args];
  try {
    return await yargs(hideBin(process.argv))
      .exitProcess(false)
      .option('transport', {
        type: 'string',
        choices: ['stdio', 'sse', 'http'],
        description: 'Transport protocol (default: stdio)'
      })
      .option('sse-host', { type: 'string' })
      .option('sse-port', { type: 'number' })
      .option('sse-allowed-origins', { type: 'string' })
      .option('http-host', { type: 'string' })
      .option('http-port', { type: 'number' })
      .option('http-allowed-origins', { type: 'string' })
      .help()
      .parse();
  } finally {
    process.argv = originalArgv;
  }
}

describe('Streamable HTTP CLI arguments', () => {
  it('parses --transport http', async () => {
    const args = await parseTransportArgs(['--transport', 'http']);
    expect(args.transport).toBe('http');
  });

  it('parses --http-host', async () => {
    const args = await parseTransportArgs(['--http-host', '0.0.0.0']);
    expect(args['http-host']).toBe('0.0.0.0');
  });

  it('parses --http-port as a number', async () => {
    const args = await parseTransportArgs(['--http-port', '3000']);
    expect(args['http-port']).toBe(3000);
  });

  it('parses --http-allowed-origins', async () => {
    const args = await parseTransportArgs([
      '--http-allowed-origins',
      'https://app.example.com,192.168.1.10'
    ]);
    expect(args['http-allowed-origins']).toBe('https://app.example.com,192.168.1.10');
  });

  it('parses all http transport flags together', async () => {
    const args = await parseTransportArgs([
      '--transport', 'http',
      '--http-host', '0.0.0.0',
      '--http-port', '3000',
      '--http-allowed-origins', 'https://app.example.com'
    ]);
    expect(args.transport).toBe('http');
    expect(args['http-host']).toBe('0.0.0.0');
    expect(args['http-port']).toBe(3000);
    expect(args['http-allowed-origins']).toBe('https://app.example.com');
  });

  it('leaves http flags undefined when not provided', async () => {
    const args = await parseTransportArgs(['--transport', 'http']);
    expect(args['http-host']).toBeUndefined();
    expect(args['http-port']).toBeUndefined();
    expect(args['http-allowed-origins']).toBeUndefined();
  });

  it('rejects an invalid --transport value', async () => {
    let threw = false;
    try {
      await parseTransportArgs(['--transport', 'invalid']);
    } catch (e: any) {
      threw = true;
      expect(e.message).toMatch(/Invalid values|choices/i);
    }
    expect(threw).toBe(true);
  });
});

// The origin allowlist is shared by the SSE and Streamable HTTP transports.
// This mirrors the SSE-era coverage to confirm the logic behaves identically
// when imported from the shared module.
describe('isOriginAllowed (shared httpShared module)', () => {
  it('allows requests with no Origin header (non-browser clients)', () => {
    expect(isOriginAllowed(undefined, '127.0.0.1')).toBe(true);
  });

  it('allows loopback origins regardless of bind host', () => {
    expect(isOriginAllowed('http://localhost:9444', '127.0.0.1')).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:3000', '127.0.0.1')).toBe(true);
    expect(isOriginAllowed('http://[::1]:9444', '127.0.0.1')).toBe(true);
  });

  it('allows an origin matching the configured bind host', () => {
    expect(isOriginAllowed('http://192.168.1.10:3000', '192.168.1.10')).toBe(true);
  });

  it('rejects a remote origin not in the allowlist', () => {
    expect(isOriginAllowed('https://evil.example', '127.0.0.1')).toBe(false);
  });

  it('rejects the literal null origin and malformed values', () => {
    expect(isOriginAllowed('null', '127.0.0.1')).toBe(false);
    expect(isOriginAllowed('not-a-url', '127.0.0.1')).toBe(false);
  });

  it('admits an explicitly configured origin on a wildcard bind', () => {
    expect(isOriginAllowed('http://192.168.1.10:9444', '0.0.0.0')).toBe(false);
    expect(
      isOriginAllowed('http://192.168.1.10:9444', '0.0.0.0', ['http://192.168.1.10:9444'])
    ).toBe(true);
  });
});

describe('createStreamableHttpServer request handling', () => {
  let server: http.Server | undefined;
  let port = 0;
  // The factory is never expected to run in these tests because every request
  // is rejected before a session is created. Track calls to assert that.
  let factoryCalls = 0;
  const stubFactory = (): Server => {
    factoryCalls += 1;
    return {} as unknown as Server;
  };

  beforeEach(async () => {
    factoryCalls = 0;
    server = await createStreamableHttpServer(stubFactory, '127.0.0.1', 0, []);
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    if (server) {
      await closeHttpServer(server);
      server = undefined;
    }
  });

  it('listens on an ephemeral port', () => {
    expect(port).toBeGreaterThan(0);
  });

  it('rejects a POST /mcp from a hostile Origin with 403', async () => {
    const res = await httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Origin: 'https://evil.example'
        }
      },
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    );
    expect(res.status).toBe(403);
    expect(factoryCalls).toBe(0);
  });

  it('returns 404 for a path other than /mcp', async () => {
    const res = await httpRequest({
      host: '127.0.0.1',
      port,
      path: '/not-mcp',
      method: 'GET'
    });
    expect(res.status).toBe(404);
    expect(factoryCalls).toBe(0);
  });

  it('returns 400 for a POST /mcp with an invalid JSON body', async () => {
    const res = await httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      '{ not valid json'
    );
    expect(res.status).toBe(400);
    expect(factoryCalls).toBe(0);
  });

  it('returns 404 for a GET /mcp without a known session id', async () => {
    const res = await httpRequest({
      host: '127.0.0.1',
      port,
      path: '/mcp',
      method: 'GET',
      headers: { 'Mcp-Session-Id': 'does-not-exist' }
    });
    expect(res.status).toBe(404);
    expect(factoryCalls).toBe(0);
  });

  it('answers an OPTIONS preflight from an allowed origin with 204 and CORS headers', async () => {
    const res = await httpRequest({
      host: '127.0.0.1',
      port,
      path: '/mcp',
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' }
    });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
  });
});
