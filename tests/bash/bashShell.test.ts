import { describe, test, beforeEach, expect } from '@jest/globals';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import type { ServerConfig } from '../../src/types/config.js';

let server: CLIServer;
let config: ServerConfig;

beforeEach(() => {
  config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (config.shells) {
    // enable bash shell using /bin/bash
    config.shells.bash = {
      type: 'bash',
      enabled: true,
      executable: { command: 'bash', args: ['-c'] },
      validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
      wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true }
    };
    if (config.shells.cmd) config.shells.cmd.enabled = false;
    if (config.shells.powershell) config.shells.powershell.enabled = false;
    if (config.shells.gitbash) config.shells.gitbash.enabled = false;
    if (config.shells.wsl) config.shells.wsl.enabled = false;
  }

  config.global.paths.allowedPaths = ['/tmp'];
  if (config.global.security) {
    config.global.security.restrictWorkingDirectory = true;
  }
  server = new CLIServer(config);
});

describe('Bash shell basic execution', () => {
  test('echo command', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'bash', command: 'echo hello', workingDir: '/tmp' }
    }) as any;
    expect(result.isError).toBe(false);
    expect((result.metadata as any).exitCode).toBe(0);
  });

  test('working directory validation', async () => {
    const result = await server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'bash', command: 'pwd', workingDir: '/tmp' }
    }) as any;
    expect(result.isError).toBe(false);
    expect((result.metadata as any).workingDirectory).toBe('/tmp');

    await expect(server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'bash', command: 'pwd', workingDir: '/etc' }
    })).rejects.toThrow();
  });
});
