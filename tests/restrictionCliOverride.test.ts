import { describe, test, expect } from '@jest/globals';
import { applyCliRestrictions } from '../src/utils/config.js';
import { buildTestConfig } from './helpers/testUtils.js';

describe('applyCliRestrictions', () => {
  test('overrides restrictions with values', () => {
    const config = buildTestConfig();
    applyCliRestrictions(config, ['rm'], ['--exec'], ['&']);
    expect(config.global.restrictions.blockedCommands).toEqual(['rm']);
    expect(config.global.restrictions.blockedArguments).toEqual(['--exec']);
    expect(config.global.restrictions.blockedOperators).toEqual(['&']);
  });

  test('empty string clears defaults', () => {
    const config = buildTestConfig();
    applyCliRestrictions(config, [''], [''], ['']);
    expect(config.global.restrictions.blockedCommands).toEqual([]);
    expect(config.global.restrictions.blockedArguments).toEqual([]);
    expect(config.global.restrictions.blockedOperators).toEqual([]);
  });
});
