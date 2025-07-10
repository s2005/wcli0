import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';
import { TestCLIServer } from '../helpers/TestCLIServer.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * This integration test demonstrates how a misconfigured WSL mount
 * can cause /mnt/c paths to point to an unexpected location.
 * It is skipped by default and intended to be run manually with
 * DEBUG output from the wsl-emulator enabled.
 */

describe.skip('WSL mount misconfiguration (manual)', () => {
  const tempRoot = path.join(os.tmpdir(), 'wsl-misconfig');
  const dMcp = path.join(tempRoot, 'd', 'mcp');

  beforeAll(() => {
    fs.mkdirSync(dMcp, { recursive: true });
    fs.writeFileSync(path.join(dMcp, 'dummy.txt'), 'dummy');
  });

  afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('ls /mnt/c/temp shows contents of /mnt/d/mcp', async () => {
    process.env.WSL_REDIRECT_MNT_C = dMcp;
    process.env.WSL_EMULATOR_DEBUG = '1';

    const server = new TestCLIServer({
      global: {
        paths: {
          allowedPaths: [
            'd\\mcp',
            'c\\temp',
            '/mnt/d/mcp',
            '/mnt/c/temp'
          ]
        }
      }
    });

    const result = await server.executeCommand({
      shell: 'wsl',
      command: 'ls /mnt/c/temp'
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('dummy.txt');
  });
});
