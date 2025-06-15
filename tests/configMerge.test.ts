import { describe, test, expect } from '@jest/globals';
import { DEFAULT_CONFIG } from '../src/utils/config.js';
import * as configModule from '../src/utils/config.js';
import type { ServerConfig } from '../src/types/config.js';

const mergeConfigs = (configModule as any).mergeConfigs as (def: ServerConfig, user: Partial<ServerConfig>) => ServerConfig;

function clone(obj: any) { return JSON.parse(JSON.stringify(obj)); }

describe('mergeConfigs edge cases', () => {
  test('handles user config enabling subset of shells', () => {
    const result = mergeConfigs(DEFAULT_CONFIG, {
      shells: {
        powershell: { enabled: false },
        cmd: { enabled: true }
      }
    });
    expect(result.shells.powershell.enabled).toBe(false);
    expect(result.shells.cmd.enabled).toBe(true);
    expect(result.shells.gitbash.enabled).toBe(true);
    expect(result.shells.wsl.enabled).toBe(true);
  });

  test('uses defaults when sections omitted', () => {
    const result = mergeConfigs(DEFAULT_CONFIG, { global: { paths: { allowedPaths: ['C\\Custom'] } } });
    expect(result.global.security.maxCommandLength).toBe(DEFAULT_CONFIG.global.security.maxCommandLength);
    expect(result.global.paths.allowedPaths).toEqual(['C\\Custom']);
  });

  test('omitted shells retain defaults', () => {
    const result = mergeConfigs(DEFAULT_CONFIG, { shells: { gitbash: { enabled: true } } });
    expect(result.shells.powershell.enabled).toBe(true);
    expect(result.shells.cmd.enabled).toBe(true);
    expect(result.shells.gitbash.enabled).toBe(true);
    expect(result.shells.wsl.enabled).toBe(true);
  });
});
