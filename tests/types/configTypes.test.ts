import { describe, test, expect } from '@jest/globals';
import path from 'path';
import { isWslShellConfig, hasWslConfig } from '../../src/utils/configTypes';
import type { BaseShellConfig, WslShellConfig } from '../../src/types/config';

describe('Config Type Guards', () => {
  describe('isWslShellConfig', () => {
    test('identifies WSL shell config', () => {
      const wslShell: WslShellConfig = {
        enabled: true,
        executable: { command: 'node', args: [path.resolve(process.cwd(), 'scripts/wsl-emulator.js'), '-e'] },
        wslConfig: {
          mountPoint: '/mnt/',
          inheritGlobalPaths: true
        }
      };
      expect(isWslShellConfig(wslShell)).toBe(true);
    });

    test('identifies non-WSL shell config', () => {
      const cmdShell: BaseShellConfig = {
        enabled: true,
        executable: { command: 'cmd.exe', args: ['/c'] }
      };
      expect(isWslShellConfig(cmdShell)).toBe(false);
    });

    test('handles undefined', () => {
      expect(isWslShellConfig(undefined)).toBe(false);
    });

    test('handles empty object', () => {
      const emptyShell = {} as BaseShellConfig;
      expect(isWslShellConfig(emptyShell)).toBe(false);
    });
  });

  describe('hasWslConfig', () => {
    test('identifies objects with wslConfig', () => {
      const config = {
        wslConfig: {
          mountPoint: '/mnt/'
        }
      };
      expect(hasWslConfig(config)).toBe(true);
    });

    test('identifies objects without wslConfig', () => {
      expect(hasWslConfig({})).toBe(false);
      expect(hasWslConfig({ other: 'prop' })).toBe(false);
    });

    test('handles null and undefined', () => {
      expect(hasWslConfig(null)).toBe(false);
      expect(hasWslConfig(undefined)).toBe(false);
    });

    test('handles wslConfig that is not an object', () => {
      expect(hasWslConfig({ wslConfig: 'not an object' })).toBe(false);
      expect(hasWslConfig({ wslConfig: 123 })).toBe(false);
      expect(hasWslConfig({ wslConfig: null })).toBe(false);
    });
  });
});
