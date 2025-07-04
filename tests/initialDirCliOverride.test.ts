import { describe, test, expect, jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { applyCliInitialDir } from '../src/utils/config.js';
import { buildTestConfig } from './helpers/testUtils.js';
import { normalizeWindowsPath } from '../src/utils/validation.js';
import { setDebugLogging } from '../src/utils/log.js';

describe('applyCliInitialDir', () => {
  test('overrides config initialDir and updates allowedPaths', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-initdir-'));
    const config = buildTestConfig({
      global: {
        security: { restrictWorkingDirectory: true },
        paths: { allowedPaths: ['C\\allowed'], initialDir: 'C\\old' }
      }
    });

    applyCliInitialDir(config, dir);
    const normalized = normalizeWindowsPath(dir);
    expect(config.global.paths.initialDir).toBe(normalized);
    expect(config.global.paths.allowedPaths.map(p => p.toLowerCase())).toContain(normalized.toLowerCase());

    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('invalid directory logs warning and does not override', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setDebugLogging(true);
    const dir = path.join(os.tmpdir(), 'nonexistent-dir');
    const config = buildTestConfig({
      global: {
        security: { restrictWorkingDirectory: true },
        paths: { allowedPaths: ['C\\allowed'], initialDir: 'C\\old' }
      }
    });

    applyCliInitialDir(config, dir);
    expect(warnSpy).toHaveBeenCalled();
    expect(config.global.paths.initialDir).toBe('C\\old');
    warnSpy.mockRestore();
    setDebugLogging(false);
  });
});
