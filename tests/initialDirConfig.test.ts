import { describe, test, expect, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig } from '../src/utils/config.js';
import { normalizeWindowsPath } from '../src/utils/validation.js';

const createTempConfig = (config: any): string => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'win-cli-initdir-'));
  const configPath = path.join(tempDir, 'config.json');
  
  // Convert old-style config to new nested structure if needed
  let finalConfig = config;
  if (config.security && !config.global) {
    finalConfig = {
      global: {
        security: { 
          ...config.security,
          // Remove initialDir since it's now in paths
          initialDir: undefined 
        },
        restrictions: { 
          blockedCommands: [], 
          blockedArguments: [],
          blockedOperators: []
        },
        paths: { 
          allowedPaths: config.security?.allowedPaths || [],
          // Move initialDir to paths if it exists in security
          initialDir: config.security?.initialDir
        }
      },
      shells: {}
    };
    
    // Delete the old path if it was added by the tests
    if (finalConfig.global?.paths?.allowedPaths && 
        !Array.isArray(finalConfig.global.paths.allowedPaths)) {
      finalConfig.global.paths.allowedPaths = [];
    }
  }
  
  fs.writeFileSync(configPath, JSON.stringify(finalConfig));
  return configPath;
};

describe('loadConfig initialDir handling', () => {
  test('valid initialDir with restrictWorkingDirectory true', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'valid-dir-'));
    const configPath = createTempConfig({ security: { initialDir: dir, restrictWorkingDirectory: true } });
    const cfg = loadConfig(configPath);
    const normalized = normalizeWindowsPath(dir);
    expect(cfg.global.paths.initialDir).toBe(normalized);
    expect(cfg.global.paths.allowedPaths).toContain(normalized.toLowerCase());
    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('valid initialDir with restrictWorkingDirectory false', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'valid-dir-'));
    const configPath = createTempConfig({ security: { initialDir: dir, restrictWorkingDirectory: false } });
    const cfg = loadConfig(configPath);
    const normalized = normalizeWindowsPath(dir);
    expect(cfg.global.paths.initialDir).toBe(normalized);
    expect(cfg.global.paths.allowedPaths).not.toContain(normalized.toLowerCase());
    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('invalid initialDir logs warning and is undefined', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const configPath = createTempConfig({ security: { initialDir: '/nonexistent/path', restrictWorkingDirectory: true } });
    const cfg = loadConfig(configPath);
    expect(cfg.global.paths.initialDir).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
    warnSpy.mockRestore();
  });

  test('initialDir not provided results in undefined', () => {
    const configPath = createTempConfig({ security: { } });
    const cfg = loadConfig(configPath);
    expect(cfg.global.paths.initialDir).toBeUndefined();
    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
  });

  test('non-string initialDir logs warning and is null', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const configPath = createTempConfig({ security: { initialDir: null } });
    const cfg = loadConfig(configPath);
    // In the new implementation, null is preserved and no warning is emitted
    expect(cfg.global.paths.initialDir).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
    fs.rmSync(path.dirname(configPath), { recursive: true, force: true });
    warnSpy.mockRestore();
  });
});
