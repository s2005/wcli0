import { describe, test, expect } from '@jest/globals';
import { DEFAULT_CONFIG } from '../src/utils/config.js';
import * as configModule from '../src/utils/config.js';
import type { ServerConfig } from '../src/types/config.js';

const mergeConfigs = (configModule as any).mergeConfigs as (def: ServerConfig, user: Partial<ServerConfig>) => ServerConfig;

describe('empty restriction arrays override defaults', () => {
  test('global empty arrays remove all restrictions', () => {
    const result = mergeConfigs(DEFAULT_CONFIG, {
      global: {
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: []
        }
      }
    });

    expect(result.global.restrictions.blockedCommands).toEqual([]);
    expect(result.global.restrictions.blockedArguments).toEqual([]);
    expect(result.global.restrictions.blockedOperators).toEqual([]);
  });
});

describe('shell config without restriction overrides', () => {
  test('does not inherit default shell restrictions', () => {
    const result = mergeConfigs(DEFAULT_CONFIG, {
      shells: {
        cmd: { enabled: true }
      }
    });

    expect(result.shells.cmd?.overrides?.restrictions).toBeUndefined();
  });
});
