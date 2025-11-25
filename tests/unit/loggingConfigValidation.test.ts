import { DEFAULT_CONFIG, validateConfig } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';

const cloneConfig = (): ServerConfig => {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as ServerConfig;
  // Restore validatePath functions dropped by JSON cloning
  for (const key of Object.keys(DEFAULT_CONFIG.shells) as Array<keyof ServerConfig['shells']>) {
    const original = (DEFAULT_CONFIG.shells as any)[key];
    if (original?.validatePath) {
      (cloned.shells as any)[key].validatePath = original.validatePath;
    }
  }
  return cloned;
};

describe('logging config validation', () => {

  test('rejects path traversal in logDirectory', () => {
    const config = cloneConfig();
    config.global.logging!.logDirectory = '..\\secret';
    expect(() => validateConfig(config)).toThrow(/logDirectory/);
  });

  test('accepts logDirectory with environment variables', () => {
    const config = cloneConfig();
    config.global.logging!.logDirectory = '%TEMP%/wcli0/logs';
    expect(() => validateConfig(config)).not.toThrow();
  });

  test('rejects invalid maxReturnLines', () => {
    const config = cloneConfig();
    config.global.logging!.maxReturnLines = -5 as unknown as number;
    expect(() => validateConfig(config)).toThrow(/maxReturnLines/);
  });
});
