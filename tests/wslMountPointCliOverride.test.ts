import { describe, test, expect } from '@jest/globals';
import { applyCliWslMountPoint } from '../src/utils/config.js';
import { buildTestConfig } from './helpers/testUtils.js';

describe('applyCliWslMountPoint', () => {
  test('overrides mount point for WSL and Bash shells', () => {
    const config = buildTestConfig({
      shells: {
        wsl: {
          type: 'wsl',
          enabled: true,
          executable: { command: 'wsl.exe', args: ['-e'] },
          wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true }
        },
        bash: {
          type: 'bash',
          enabled: true,
          executable: { command: 'bash', args: ['-c'] },
          wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true }
        }
      }
    });

    applyCliWslMountPoint(config, '/windows/');

    expect(config.shells.wsl?.wslConfig?.mountPoint).toBe('/windows/');
    expect(config.shells.bash?.wslConfig?.mountPoint).toBe('/windows/');
  });

  test('ignores when mount point is undefined', () => {
    const config = buildTestConfig({
      shells: {
        wsl: {
          type: 'wsl',
          enabled: true,
          executable: { command: 'wsl.exe', args: ['-e'] },
          wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true }
        }
      }
    });

    applyCliWslMountPoint(config, undefined);

    expect(config.shells.wsl?.wslConfig?.mountPoint).toBe('/mnt/');
  });
});
