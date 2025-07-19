import { describe, test, expect } from '@jest/globals';
import { applyCliDeveloperMode } from '../src/utils/config.js';
import { buildTestConfig } from './helpers/testUtils.js';

describe('applyCliDeveloperMode', () => {
  test('enables shells when developer mode active', () => {
    const config = buildTestConfig({
      shells: {
        powershell: { type: 'powershell', enabled: false, executable: { command: 'powershell.exe', args: [] } },
        bash: { type: 'bash', enabled: false, executable: { command: 'bash', args: ['-c'] }, wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true } },
        wsl: { type: 'wsl', enabled: false, executable: { command: 'wsl', args: ['-e'] }, wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true } }
      }
    });
    applyCliDeveloperMode(config, true);
    expect(config.shells.powershell?.enabled).toBe(true);
    expect(config.shells.bash?.enabled).toBe(true);
    expect(config.shells.wsl?.enabled).toBe(true);
  });

  test('disables shells when developer mode off', () => {
    const config = buildTestConfig({
      shells: {
        powershell: { type: 'powershell', enabled: true, executable: { command: 'powershell.exe', args: [] } },
        bash: { type: 'bash', enabled: true, executable: { command: 'bash', args: ['-c'] }, wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true } },
        wsl: { type: 'wsl', enabled: true, executable: { command: 'wsl', args: ['-e'] }, wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true } }
      }
    });
    applyCliDeveloperMode(config, false);
    expect(config.shells.powershell?.enabled).toBe(false);
    expect(config.shells.bash?.enabled).toBe(false);
    expect(config.shells.wsl?.enabled).toBe(false);
  });
});
