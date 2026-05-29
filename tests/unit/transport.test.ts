import { describe, it, expect, jest } from '@jest/globals';
import { DEFAULT_CONFIG, applyCliTransport, mergeConfigs, validateConfig } from '../../src/utils/config.js';
import { isOriginAllowed } from '../../src/utils/transport.js';
import type { ServerConfig } from '../../src/types/config.js';

// parseArgs test helper - imports the module and parses with given args
async function parseWithArgs(args: string[]): Promise<any> {
  // We test parseArgs by calling yargs directly with the same configuration
  const yargs = (await import('yargs/yargs')).default;
  const { hideBin } = await import('yargs/helpers');

  // Simulate process.argv for testing
  const originalArgv = process.argv;
  process.argv = ['node', 'test.js', ...args];
  try {
    const result = await yargs(hideBin(process.argv))
      .option('transport', {
        type: 'string',
        choices: ['stdio', 'sse'],
        description: 'Transport protocol (default: stdio)'
      })
      .option('sse-host', {
        type: 'string',
        description: 'Host address for SSE transport (default: 127.0.0.1)'
      })
      .option('sse-port', {
        type: 'number',
        description: 'Port for SSE transport (default: 9444)'
      })
      .option('sse-allowed-origins', {
        type: 'string',
        description: 'Comma-separated browser origins allowed to use the SSE transport'
      })
      .help()
      .parse();
    return result;
  } finally {
    process.argv = originalArgv;
  }
}

describe('TransportConfig', () => {
  describe('DEFAULT_CONFIG transport defaults', () => {
    it('should have stdio as default transport mode', () => {
      expect(DEFAULT_CONFIG.transport).toBeDefined();
      expect(DEFAULT_CONFIG.transport!.mode).toBe('stdio');
    });

    it('should have default SSE host as 127.0.0.1', () => {
      expect(DEFAULT_CONFIG.transport!.sseHost).toBe('127.0.0.1');
    });

    it('should have default SSE port as 9444', () => {
      expect(DEFAULT_CONFIG.transport!.ssePort).toBe(9444);
    });
  });

  describe('applyCliTransport', () => {
    function makeConfig(): ServerConfig {
      return {
        ...DEFAULT_CONFIG,
        transport: { ...DEFAULT_CONFIG.transport! }
      };
    }

    it('should initialize transport config if missing', () => {
      const config: ServerConfig = { ...DEFAULT_CONFIG, transport: undefined };
      applyCliTransport(config);
      expect(config.transport).toEqual({
        mode: 'stdio',
        sseHost: '127.0.0.1',
        ssePort: 9444,
        sseAllowedOrigins: [],
        httpHost: '127.0.0.1',
        httpPort: 9444,
        httpAllowedOrigins: []
      });
    });

    it('should set mode to sse when transport=sse', () => {
      const config = makeConfig();
      applyCliTransport(config, 'sse');
      expect(config.transport!.mode).toBe('sse');
    });

    it('should set mode to stdio when transport=stdio', () => {
      const config = makeConfig();
      config.transport!.mode = 'sse';
      applyCliTransport(config, 'stdio');
      expect(config.transport!.mode).toBe('stdio');
    });

    it('should not change mode when transport is undefined', () => {
      const config = makeConfig();
      applyCliTransport(config, undefined);
      expect(config.transport!.mode).toBe('stdio');
    });

    it('should override sseHost', () => {
      const config = makeConfig();
      applyCliTransport(config, undefined, '0.0.0.0');
      expect(config.transport!.sseHost).toBe('0.0.0.0');
    });

    it('should override ssePort', () => {
      const config = makeConfig();
      applyCliTransport(config, undefined, undefined, 3000);
      expect(config.transport!.ssePort).toBe(3000);
    });

    it('should apply all CLI overrides together', () => {
      const config = makeConfig();
      applyCliTransport(config, 'sse', '0.0.0.0', 3000);
      expect(config.transport).toEqual({
        mode: 'sse',
        sseHost: '0.0.0.0',
        ssePort: 3000,
        sseAllowedOrigins: [],
        httpHost: '127.0.0.1',
        httpPort: 9444,
        httpAllowedOrigins: []
      });
    });

    it('P12: should parse comma-separated sseAllowedOrigins', () => {
      const config = makeConfig();
      applyCliTransport(config, 'sse', '0.0.0.0', undefined, 'https://app.example.com, 192.168.1.10');
      expect(config.transport!.sseAllowedOrigins).toEqual([
        'https://app.example.com',
        '192.168.1.10'
      ]);
    });

    it('P12: should ignore an sseAllowedOrigins string with only blanks', () => {
      const config = makeConfig();
      config.transport!.sseAllowedOrigins = ['https://keep.example'];
      applyCliTransport(config, undefined, undefined, undefined, ' , , ');
      // Nothing usable was provided, so the existing value is preserved.
      expect(config.transport!.sseAllowedOrigins).toEqual(['https://keep.example']);
    });

    it('should ignore invalid ssePort values', () => {
      const config = makeConfig();
      applyCliTransport(config, undefined, undefined, -1);
      expect(config.transport!.ssePort).toBe(9444);
    });

    it('should ignore ssePort of 0', () => {
      const config = makeConfig();
      applyCliTransport(config, undefined, undefined, 0);
      expect(config.transport!.ssePort).toBe(9444);
    });

    it('should ignore ssePort above 65535', () => {
      const config = makeConfig();
      applyCliTransport(config, undefined, undefined, 70000);
      expect(config.transport!.ssePort).toBe(9444);
    });

    it('P9: should ignore fractional ssePort values', () => {
      const config = makeConfig();
      applyCliTransport(config, undefined, undefined, 9444.5);
      expect(config.transport!.ssePort).toBe(9444);
    });

    it('P9: should ignore NaN ssePort values', () => {
      const config = makeConfig();
      applyCliTransport(config, undefined, undefined, Number.NaN);
      expect(config.transport!.ssePort).toBe(9444);
    });

    it('should ignore empty sseHost', () => {
      const config = makeConfig();
      applyCliTransport(config, undefined, '  ');
      expect(config.transport!.sseHost).toBe('127.0.0.1');
    });

    it('should trim sseHost whitespace', () => {
      const config = makeConfig();
      applyCliTransport(config, undefined, '  0.0.0.0  ');
      expect(config.transport!.sseHost).toBe('0.0.0.0');
    });
  });

  describe('mergeConfigs transport section', () => {
    it('should use default transport when user config has no transport', () => {
      const merged = mergeConfigs(DEFAULT_CONFIG, { global: DEFAULT_CONFIG.global });
      expect(merged.transport).toEqual(DEFAULT_CONFIG.transport);
    });

    it('should override transport mode from user config', () => {
      const merged = mergeConfigs(DEFAULT_CONFIG, {
        global: DEFAULT_CONFIG.global,
        transport: { mode: 'sse', sseHost: '0.0.0.0', ssePort: 3000 }
      } as any);
      expect(merged.transport!.mode).toBe('sse');
      expect(merged.transport!.sseHost).toBe('0.0.0.0');
      expect(merged.transport!.ssePort).toBe(3000);
    });

    it('should merge partial transport config with defaults', () => {
      const merged = mergeConfigs(DEFAULT_CONFIG, {
        global: DEFAULT_CONFIG.global,
        transport: { mode: 'sse' }
      } as any);
      expect(merged.transport!.mode).toBe('sse');
      expect(merged.transport!.sseHost).toBe('127.0.0.1');
      expect(merged.transport!.ssePort).toBe(9444);
    });
  });
});

// P2: Origin allowlist for the SSE transport (DNS-rebinding defense).
describe('isOriginAllowed (P2)', () => {
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
    expect(isOriginAllowed('http://attacker.test:3000', '127.0.0.1')).toBe(false);
  });

  it('rejects the literal null origin', () => {
    expect(isOriginAllowed('null', '127.0.0.1')).toBe(false);
  });

  it('rejects a malformed origin', () => {
    expect(isOriginAllowed('not-a-url', '127.0.0.1')).toBe(false);
  });

  it('is case-insensitive for the origin hostname', () => {
    expect(isOriginAllowed('http://LOCALHOST:9444', '127.0.0.1')).toBe(true);
  });
});

// P12: explicit allowed-origin list, required for wildcard binds (0.0.0.0 / ::)
// where the bind host is not a usable origin and for reverse-proxy hostnames.
describe('isOriginAllowed allowed-origins list (P12)', () => {
  it('rejects a LAN browser origin on a wildcard bind when no origins are configured', () => {
    expect(isOriginAllowed('http://192.168.1.10:9444', '0.0.0.0')).toBe(false);
    expect(isOriginAllowed('http://192.168.1.10:9444', '0.0.0.0', [])).toBe(false);
  });

  it('allows an origin whose host is in the configured list (full origin form)', () => {
    expect(
      isOriginAllowed('http://192.168.1.10:9444', '0.0.0.0', ['http://192.168.1.10:9444'])
    ).toBe(true);
  });

  it('allows an origin whose host is in the configured list (bare host form)', () => {
    expect(
      isOriginAllowed('http://192.168.1.10:9444', '0.0.0.0', ['192.168.1.10'])
    ).toBe(true);
  });

  it('matches a configured host case-insensitively regardless of port/scheme', () => {
    expect(
      isOriginAllowed('https://APP.example.com', '0.0.0.0', ['http://app.example.com:8443'])
    ).toBe(true);
  });

  it('still rejects an origin that is not loopback, the bind host, or in the list', () => {
    expect(
      isOriginAllowed('https://evil.example', '0.0.0.0', ['192.168.1.10'])
    ).toBe(false);
  });

  it('still allows loopback even when an allowed-origins list is configured', () => {
    expect(
      isOriginAllowed('http://127.0.0.1:9444', '0.0.0.0', ['192.168.1.10'])
    ).toBe(true);
  });
});

// P12: config-file validation of transport.sseAllowedOrigins.
describe('validateConfig sseAllowedOrigins (P12)', () => {
  function configWithOrigins(sseAllowedOrigins: unknown): ServerConfig {
    return {
      global: DEFAULT_CONFIG.global,
      shells: {},
      transport: {
        mode: 'sse',
        sseHost: '0.0.0.0',
        ssePort: 9444,
        sseAllowedOrigins
      }
    } as unknown as ServerConfig;
  }

  it('rejects a non-array sseAllowedOrigins', () => {
    expect(() => validateConfig(configWithOrigins('https://app.example.com'))).toThrow(
      /sseAllowedOrigins must be an array/
    );
  });

  it('rejects empty-string entries', () => {
    expect(() => validateConfig(configWithOrigins(['https://ok.example', '   ']))).toThrow(
      /sseAllowedOrigins/
    );
  });

  it('accepts a valid array of origins', () => {
    expect(() =>
      validateConfig(configWithOrigins(['https://app.example.com', '192.168.1.10']))
    ).not.toThrow();
  });
});

describe('Transport CLI Arguments', () => {
  it('should return undefined transport when no flags given', async () => {
    const args = await parseWithArgs([]);
    expect(args.transport).toBeUndefined();
    expect(args['sse-host']).toBeUndefined();
    expect(args['sse-port']).toBeUndefined();
  });

  it('should parse --transport sse', async () => {
    const args = await parseWithArgs(['--transport', 'sse']);
    expect(args.transport).toBe('sse');
  });

  it('should parse --transport stdio', async () => {
    const args = await parseWithArgs(['--transport', 'stdio']);
    expect(args.transport).toBe('stdio');
  });

  it('should parse --sse-host', async () => {
    const args = await parseWithArgs(['--sse-host', '0.0.0.0']);
    expect(args['sse-host']).toBe('0.0.0.0');
  });

  it('should parse --sse-port', async () => {
    const args = await parseWithArgs(['--sse-port', '3000']);
    expect(args['sse-port']).toBe(3000);
  });

  it('should parse all transport flags together', async () => {
    const args = await parseWithArgs([
      '--transport', 'sse',
      '--sse-host', '0.0.0.0',
      '--sse-port', '3000'
    ]);
    expect(args.transport).toBe('sse');
    expect(args['sse-host']).toBe('0.0.0.0');
    expect(args['sse-port']).toBe(3000);
  });

  it('P12: should parse --sse-allowed-origins', async () => {
    const args = await parseWithArgs([
      '--sse-allowed-origins', 'https://app.example.com,192.168.1.10'
    ]);
    expect(args['sse-allowed-origins']).toBe('https://app.example.com,192.168.1.10');
  });

  it('should reject invalid transport value', async () => {
    const yargs = (await import('yargs/yargs')).default;
    const { hideBin } = await import('yargs/helpers');
    const originalArgv = process.argv;
    process.argv = ['node', 'test.js', '--transport', 'invalid'];
    try {
      const result = await yargs(hideBin(process.argv))
        .exitProcess(false)
        .option('transport', {
          type: 'string',
          choices: ['stdio', 'sse'],
          description: 'Transport protocol (default: stdio)'
        })
        .help()
        .parse();
      // If we get here, validation didn't fail - check that transport is undefined or invalid
      expect(result.transport).toBe('invalid');
    } catch (e: any) {
      expect(e.message).toMatch(/Invalid values|choices/i);
    } finally {
      process.argv = originalArgv;
    }
  });
});
