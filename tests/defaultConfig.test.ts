import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createDefaultConfig, DEFAULT_CONFIG } from '../src/utils/config.js';

describe('createDefaultConfig', () => {
  test('writes default config without validatePath functions', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cfgtest-'));
    const file = path.join(tmp, 'config.json');

    createDefaultConfig(file);

    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(saved.global.security.commandTimeout).toBe(DEFAULT_CONFIG.global.security.commandTimeout);

    for (const shell of Object.values(saved.shells)) {
      if (!shell) continue;
      expect(shell.validatePath).toBeUndefined();
    }

    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
