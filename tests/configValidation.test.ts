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
    if (cfg.shells.powershell) cfg.shells.powershell.enabled = true;
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
});
