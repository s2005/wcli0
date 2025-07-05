import { describe, test, expect } from '@jest/globals';
import { applyCliShellAndAllowedDirs } from '../src/utils/config.js';
import { buildTestConfig } from './helpers/testUtils.js';
import { normalizeAllowedPaths } from '../src/utils/validation.js';

describe('applyCliShellAndAllowedDirs', () => {
  test('enables only selected shell and sets allowed directories', () => {
    const config = buildTestConfig({
      shells: {
        cmd: {
          enabled: true,
          executable: { command: 'cmd.exe', args: ['/c'] }
        },
        powershell: {
          enabled: true,
          executable: { command: 'powershell.exe', args: ['-Command'] }
        }
      }
    });
    applyCliShellAndAllowedDirs(config, 'cmd', ['C\\one', 'D\\two']);
    expect(config.shells.cmd?.enabled).toBe(true);
    expect(config.shells.powershell?.enabled).toBe(false);
    expect(config.global.paths.allowedPaths).toEqual(
      normalizeAllowedPaths(['C\\one', 'D\\two'])
    );
    expect((config.shells.cmd?.overrides?.paths?.allowedPaths)).toEqual(
      ['C\\one', 'D\\two']
    );
  });
});
