import { describe, test, expect } from '@jest/globals';
import { applyCliUnsafeMode } from '../src/utils/config.js';
import { buildTestConfig } from './helpers/testUtils.js';

describe('applyCliUnsafeMode', () => {
  test('disables safety mechanisms and clears restrictions in yolo mode but keeps directory restriction', () => {
    const config = buildTestConfig({
      global: {
        security: {
          restrictWorkingDirectory: false
        },
        restrictions: {
          blockedCommands: ['rm'],
          blockedArguments: ['--danger'],
          blockedOperators: ['&']
        }
      }
    });

    applyCliUnsafeMode(config, { yolo: true });

    expect(config.global.security.enableInjectionProtection).toBe(false);
    expect(config.global.security.restrictWorkingDirectory).toBe(true);
    expect(config.global.restrictions.blockedCommands).toEqual([]);
    expect(config.global.restrictions.blockedArguments).toEqual([]);
    expect(config.global.restrictions.blockedOperators).toEqual([]);
  });

  test('removes all restrictions in unsafe mode', () => {
    const config = buildTestConfig({
      global: {
        security: {
          enableInjectionProtection: true,
          restrictWorkingDirectory: true
        },
        restrictions: {
          blockedCommands: ['format'],
          blockedArguments: ['--wipe'],
          blockedOperators: ['|']
        }
      }
    });

    applyCliUnsafeMode(config, { unsafe: true });

    expect(config.global.security.enableInjectionProtection).toBe(false);
    expect(config.global.security.restrictWorkingDirectory).toBe(false);
    expect(config.global.restrictions.blockedCommands).toEqual([]);
    expect(config.global.restrictions.blockedArguments).toEqual([]);
    expect(config.global.restrictions.blockedOperators).toEqual([]);
  });

  test('leaves configuration unchanged when disabled', () => {
    const config = buildTestConfig({
      global: {
        security: {
          enableInjectionProtection: true,
          restrictWorkingDirectory: true
        },
        restrictions: {
          blockedCommands: ['del'],
          blockedArguments: ['--system'],
          blockedOperators: ['|']
        }
      }
    });

    applyCliUnsafeMode(config, undefined);

    expect(config.global.security.enableInjectionProtection).toBe(true);
    expect(config.global.security.restrictWorkingDirectory).toBe(true);
    expect(config.global.restrictions.blockedCommands).toEqual(['del']);
    expect(config.global.restrictions.blockedArguments).toEqual(['--system']);
    expect(config.global.restrictions.blockedOperators).toEqual(['|']);
  });

  test('throws when both yolo and unsafe are enabled', () => {
    const config = buildTestConfig();

    expect(() => applyCliUnsafeMode(config, { yolo: true, unsafe: true })).toThrow(
      'Cannot enable both --unsafe and --yolo modes at the same time.'
    );
  });
});
