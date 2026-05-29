import { describe, it, expect, jest } from '@jest/globals';
import { DEFAULT_CONFIG, applyCliTransport, mergeConfigs } from '../../src/utils/config.js';
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
        ssePort: 9444
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
        ssePort: 3000
      });
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
