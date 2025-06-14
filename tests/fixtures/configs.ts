import { ServerConfig } from '../../src/types/config.js';
import { buildTestConfig } from '../helpers/testUtils.js';

/**
 * Collection of standard ServerConfig objects for test suites.
 */

/** Base configuration cloned from DEFAULT_CONFIG for general test usage. */
export const baseConfig: ServerConfig = buildTestConfig();

/** Secure configuration used for strict security scenarios. */
export const secureConfig: ServerConfig = buildTestConfig({
  security: {
    maxCommandLength: 1000,
    blockedCommands: ['rm', 'del', 'format'],
    blockedArguments: ['--system', '-rf'],
    allowedPaths: ['C\\safe\\path'],
    restrictWorkingDirectory: true,
    commandTimeout: 30,
    enableInjectionProtection: true,
  },
  shells: {
    powershell: {
      enabled: true,
      command: 'powershell.exe',
      args: ['-NoProfile', '-Command'],
      blockedOperators: ['&', ';', '`'],
    },
  },
});

/** Permissive configuration with relaxed security for convenience tests. */
export const permissiveConfig: ServerConfig = buildTestConfig({
  security: {
    blockedCommands: [],
    blockedArguments: [],
    restrictWorkingDirectory: false,
    enableInjectionProtection: false,
  },
});
