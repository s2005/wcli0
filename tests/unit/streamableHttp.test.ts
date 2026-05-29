import { describe, it, expect } from '@jest/globals';
import {
  DEFAULT_CONFIG,
  applyCliTransport,
  mergeConfigs,
  validateConfig
} from '../../src/utils/config.js';
import { createSerializableConfig } from '../../src/utils/configUtils.js';
import type { ServerConfig } from '../../src/types/config.js';

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
