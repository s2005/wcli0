import { describe, test, expect, jest } from '@jest/globals';
import { applyCliSecurityOverrides } from '../src/utils/config.js';
import { buildTestConfig } from './helpers/testUtils.js';
import { setDebugLogging } from '../src/utils/log.js';

describe('applyCliSecurityOverrides', () => {
  test('overrides security values with valid numbers', () => {
    const config = buildTestConfig();
    applyCliSecurityOverrides(config, 1234, 45);
    expect(config.global.security.maxCommandLength).toBe(1234);
    expect(config.global.security.commandTimeout).toBe(45);
  });

  test('logs warning and ignores invalid values', () => {
    const config = buildTestConfig();
    setDebugLogging(true);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    applyCliSecurityOverrides(config, 0, -1);
    expect(warnSpy).toHaveBeenCalled();
    expect(config.global.security.maxCommandLength).not.toBe(0);
    expect(config.global.security.commandTimeout).not.toBe(-1);
    warnSpy.mockRestore();
    setDebugLogging(false);
  });
});

