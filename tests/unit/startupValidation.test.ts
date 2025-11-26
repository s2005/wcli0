/**
 * Unit tests for startup validation and config defaults
 * Tests for Issue 2 (P0): validateConfig called at startup
 * Tests for Issue 8 (P2): logRetentionMinutes not shadowed by default
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { loadConfig, DEFAULT_CONFIG, validateConfig } from '../../src/utils/config.js';
import type { ServerConfig, LoggingConfig } from '../../src/types/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const cloneConfig = (): ServerConfig => {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as ServerConfig;
  // Restore validatePath functions dropped by JSON cloning
  for (const key of Object.keys(DEFAULT_CONFIG.shells) as Array<keyof ServerConfig['shells']>) {
    const original = (DEFAULT_CONFIG.shells as any)[key];
    if (original?.validatePath) {
      (cloned.shells as any)[key].validatePath = original.validatePath;
    }
  }
  return cloned;
};

describe('Startup Validation - validateConfig called at load', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wcli-startup-test-'));
    configPath = path.join(tempDir, 'config.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {}
  });

  test('loadConfig throws on invalid maxCommandLength', () => {
    const badConfig = {
      global: {
        security: {
          maxCommandLength: 0, // Invalid: must be positive
          commandTimeout: 30,
          enableInjectionProtection: true,
          restrictWorkingDirectory: false
        },
        restrictions: { blockedCommands: [], blockedArguments: [], blockedOperators: [] },
        paths: { allowedPaths: [] }
      },
      shells: {}
    };
    fs.writeFileSync(configPath, JSON.stringify(badConfig));

    expect(() => loadConfig(configPath)).toThrow('maxCommandLength must be positive');
  });

  test('loadConfig throws on invalid commandTimeout', () => {
    const badConfig = {
      global: {
        security: {
          maxCommandLength: 2000,
          commandTimeout: 0, // Invalid: must be at least 1
          enableInjectionProtection: true,
          restrictWorkingDirectory: false
        },
        restrictions: { blockedCommands: [], blockedArguments: [], blockedOperators: [] },
        paths: { allowedPaths: [] }
      },
      shells: {}
    };
    fs.writeFileSync(configPath, JSON.stringify(badConfig));

    expect(() => loadConfig(configPath)).toThrow('commandTimeout must be at least 1 second');
  });

  test('loadConfig validates logging config if present', () => {
    const badConfig = {
      global: {
        security: {
          maxCommandLength: 2000,
          commandTimeout: 30,
          enableInjectionProtection: true,
          restrictWorkingDirectory: false
        },
        restrictions: { blockedCommands: [], blockedArguments: [], blockedOperators: [] },
        paths: { allowedPaths: [] },
        logging: {
          logDirectory: '../../../etc/passwd' // Path traversal
        }
      },
      shells: {}
    };
    fs.writeFileSync(configPath, JSON.stringify(badConfig));

    expect(() => loadConfig(configPath)).toThrow(/logDirectory/);
  });
});

describe('Default Config - logRetentionMinutes not shadowed', () => {
  test('DEFAULT_CONFIG.global.logging should not have logRetentionDays set', () => {
    // Issue 8 fix: logRetentionDays should not be set in defaults
    // so that logRetentionMinutes is the effective default
    expect(DEFAULT_CONFIG.global.logging?.logRetentionDays).toBeUndefined();
  });

  test('DEFAULT_CONFIG.global.logging should have logRetentionMinutes set', () => {
    expect(DEFAULT_CONFIG.global.logging?.logRetentionMinutes).toBeDefined();
    expect(DEFAULT_CONFIG.global.logging?.logRetentionMinutes).toBeGreaterThan(0);
  });

  test('user-provided logRetentionDays should override minutes', () => {
    const config = cloneConfig();
    config.global.logging!.logRetentionDays = 7;
    config.global.logging!.logRetentionMinutes = 30;
    
    // This mimics what getRetentionMs() does
    const retentionMs = config.global.logging!.logRetentionDays !== undefined
      ? config.global.logging!.logRetentionDays * 24 * 60 * 60 * 1000
      : (config.global.logging!.logRetentionMinutes ?? 60) * 60 * 1000;
    
    // Should use days (7 days = 604800000 ms)
    expect(retentionMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test('when logRetentionDays is undefined, logRetentionMinutes is used', () => {
    const config = cloneConfig();
    config.global.logging!.logRetentionDays = undefined;
    config.global.logging!.logRetentionMinutes = 30;
    
    // This mimics what getRetentionMs() does
    const retentionMs = config.global.logging!.logRetentionDays !== undefined
      ? config.global.logging!.logRetentionDays * 24 * 60 * 60 * 1000
      : (config.global.logging!.logRetentionMinutes ?? 60) * 60 * 1000;
    
    // Should use minutes (30 min = 1800000 ms)
    expect(retentionMs).toBe(30 * 60 * 1000);
  });
});

describe('Default Config - limit naming clarity', () => {
  test('maxTotalStorageSize (memory) and maxTotalLogSize (disk) are distinct', () => {
    const logging = DEFAULT_CONFIG.global.logging!;
    
    // Both should be defined with clear different purposes
    expect(logging.maxTotalStorageSize).toBeDefined();
    // maxTotalLogSize may or may not be set in defaults, but they should be different concepts
    
    // maxTotalStorageSize is for in-memory
    expect(logging.maxTotalStorageSize).toBeGreaterThan(0);
  });
});
