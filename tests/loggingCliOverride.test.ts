import { describe, test, expect } from '@jest/globals';
import { applyCliLogging, applyDebugLogDirectory, getDefaultDebugLogDirectory } from '../src/utils/config.js';
import { buildTestConfig } from './helpers/testUtils.js';

describe('applyCliLogging', () => {
  test('initializes logging config when not present', () => {
    const config = buildTestConfig();
    expect(config.global.logging).toBeUndefined();
    
    applyCliLogging(config, 50);
    
    expect(config.global.logging).toBeDefined();
    expect(config.global.logging!.maxOutputLines).toBe(50);
  });

  test('overrides maxOutputLines with valid value', () => {
    const config = buildTestConfig();
    applyCliLogging(config, 100);
    
    expect(config.global.logging!.maxOutputLines).toBe(100);
  });

  test('ignores maxOutputLines when undefined or zero', () => {
    const config = buildTestConfig();
    applyCliLogging(config, undefined);
    
    // Should still initialize with defaults
    expect(config.global.logging).toBeUndefined();
    
    // Now with zero
    const config2 = buildTestConfig();
    applyCliLogging(config2, 0);
    expect(config2.global.logging).toBeUndefined();
  });

  test('sets enableTruncation to true', () => {
    const config = buildTestConfig();
    applyCliLogging(config, undefined, true);
    
    expect(config.global.logging!.enableTruncation).toBe(true);
  });

  test('sets enableTruncation to false', () => {
    const config = buildTestConfig();
    applyCliLogging(config, undefined, false);
    
    expect(config.global.logging!.enableTruncation).toBe(false);
  });

  test('sets enableLogResources to true', () => {
    const config = buildTestConfig();
    applyCliLogging(config, undefined, undefined, true);
    
    expect(config.global.logging!.enableLogResources).toBe(true);
  });

  test('sets enableLogResources to false', () => {
    const config = buildTestConfig();
    applyCliLogging(config, undefined, undefined, false);
    
    expect(config.global.logging!.enableLogResources).toBe(false);
  });

  test('overrides maxReturnLines with valid value', () => {
    const config = buildTestConfig();
    applyCliLogging(config, undefined, undefined, undefined, 1000);
    
    expect(config.global.logging!.maxReturnLines).toBe(1000);
  });

  test('ignores maxReturnLines when undefined or zero', () => {
    const config = buildTestConfig();
    applyCliLogging(config, undefined, undefined, undefined, 0);
    
    // No logging config should be created if all params are undefined/invalid
    expect(config.global.logging).toBeUndefined();
  });

  test('applies multiple logging options together', () => {
    const config = buildTestConfig();
    applyCliLogging(config, 30, true, true, 250);
    
    expect(config.global.logging).toBeDefined();
    expect(config.global.logging!.maxOutputLines).toBe(30);
    expect(config.global.logging!.enableTruncation).toBe(true);
    expect(config.global.logging!.enableLogResources).toBe(true);
    expect(config.global.logging!.maxReturnLines).toBe(250);
  });

  test('sets logDirectory with valid path', () => {
    const config = buildTestConfig();
    applyCliLogging(config, undefined, undefined, undefined, undefined, '/tmp/logs');
    
    expect(config.global.logging).toBeDefined();
    expect(config.global.logging!.logDirectory).toBe('/tmp/logs');
  });

  test('trims logDirectory whitespace', () => {
    const config = buildTestConfig();
    applyCliLogging(config, undefined, undefined, undefined, undefined, '  /tmp/logs  ');
    
    expect(config.global.logging!.logDirectory).toBe('/tmp/logs');
  });

  test('ignores empty logDirectory', () => {
    const config = buildTestConfig();
    applyCliLogging(config, undefined, undefined, undefined, undefined, '   ');
    
    expect(config.global.logging).toBeUndefined();
  });

  test('preserves existing logging config values not overridden', () => {
    const config = buildTestConfig();
    // First call to initialize with defaults
    applyCliLogging(config, 50);
    const originalMaxStoredLogs = config.global.logging!.maxStoredLogs;
    
    // Second call should only update maxOutputLines
    applyCliLogging(config, 100);
    
    expect(config.global.logging!.maxOutputLines).toBe(100);
    expect(config.global.logging!.maxStoredLogs).toBe(originalMaxStoredLogs);
  });

  test('does not modify config when all parameters are undefined', () => {
    const config = buildTestConfig();
    applyCliLogging(config, undefined, undefined, undefined, undefined, undefined);
    
    expect(config.global.logging).toBeUndefined();
  });
});

describe('applyDebugLogDirectory', () => {
  test('initializes logging and sets default debug log directory when enabled', () => {
    const config = buildTestConfig();
    expect(config.global.logging).toBeUndefined();

    applyDebugLogDirectory(config, true);

    expect(config.global.logging).toBeDefined();
    expect(config.global.logging!.logDirectory).toBe(getDefaultDebugLogDirectory());
  });

  test('does not override existing logDirectory', () => {
    const config = buildTestConfig({
      global: {
        logging: {
          logDirectory: '/custom/logs'
        } as any
      }
    });

    applyDebugLogDirectory(config, true);

    expect(config.global.logging!.logDirectory).toBe('/custom/logs');
  });

  test('does nothing when debug is disabled', () => {
    const config = buildTestConfig();
    applyDebugLogDirectory(config, false);
    
    expect(config.global.logging).toBeUndefined();
  });
});
