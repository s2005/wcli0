import { describe, test, expect } from '@jest/globals';
import { DEFAULT_CONFIG } from '../src/utils/config.js';
import * as configModule from '../src/utils/config.js';
import type { ServerConfig } from '../src/types/config.js';

const validateConfig = (configModule as any).validateConfig as (cfg: ServerConfig) => void;

function cloneDefault(): ServerConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

describe('validateConfig helper', () => {
  test('throws for nonpositive maxCommandLength', () => {
    const cfg = cloneDefault();
    cfg.global.security.maxCommandLength = 0;
    expect(() => validateConfig(cfg)).toThrow('maxCommandLength must be positive');
  });

  test('throws for enabled shell missing executable fields', () => {
    const cfg = cloneDefault();
    cfg.shells.powershell!.executable.command = '' as any;
    expect(() => validateConfig(cfg)).toThrow(/Invalid configuration for powershell/);
  });

  test('throws for commandTimeout below 1', () => {
    const cfg = cloneDefault();
    cfg.global.security.commandTimeout = 0;
    expect(() => validateConfig(cfg)).toThrow('commandTimeout must be at least 1 second');
  });

  test('passes for valid configuration', () => {
    const cfg = cloneDefault();
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  // P4: validateConfig must check the transport section, not only CLI flags.
  describe('transport section (P4)', () => {
    test('throws for non-numeric ssePort from config file', () => {
      const cfg = cloneDefault();
      cfg.transport = { mode: 'sse', sseHost: '127.0.0.1', ssePort: '3000' as any };
      expect(() => validateConfig(cfg)).toThrow(
        'transport.ssePort must be an integer between 1 and 65535'
      );
    });

    test('throws for ssePort below 1', () => {
      const cfg = cloneDefault();
      cfg.transport = { mode: 'sse', sseHost: '127.0.0.1', ssePort: 0 };
      expect(() => validateConfig(cfg)).toThrow(/transport\.ssePort/);
    });

    test('throws for ssePort above 65535', () => {
      const cfg = cloneDefault();
      cfg.transport = { mode: 'sse', sseHost: '127.0.0.1', ssePort: 70000 };
      expect(() => validateConfig(cfg)).toThrow(/transport\.ssePort/);
    });

    test('throws for non-integer ssePort', () => {
      const cfg = cloneDefault();
      cfg.transport = { mode: 'sse', sseHost: '127.0.0.1', ssePort: 3000.5 };
      expect(() => validateConfig(cfg)).toThrow(/transport\.ssePort/);
    });

    test('throws for invalid mode', () => {
      const cfg = cloneDefault();
      cfg.transport = { mode: 'http' as any, sseHost: '127.0.0.1', ssePort: 9444 };
      expect(() => validateConfig(cfg)).toThrow("transport.mode must be 'stdio' or 'sse'");
    });

    test('throws for empty sseHost', () => {
      const cfg = cloneDefault();
      cfg.transport = { mode: 'sse', sseHost: '   ', ssePort: 9444 };
      expect(() => validateConfig(cfg)).toThrow('transport.sseHost must be a non-empty string');
    });

    test('passes for valid sse transport', () => {
      const cfg = cloneDefault();
      cfg.transport = { mode: 'sse', sseHost: '0.0.0.0', ssePort: 3000 };
      expect(() => validateConfig(cfg)).not.toThrow();
    });

    test('passes when transport section is absent', () => {
      const cfg = cloneDefault();
      cfg.transport = undefined;
      expect(() => validateConfig(cfg)).not.toThrow();
    });
  });
});
