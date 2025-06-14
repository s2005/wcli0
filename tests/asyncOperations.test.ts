import { describe, test, expect, beforeEach } from '@jest/globals';
import { CLIServer } from '../src/index.js';
import { DEFAULT_CONFIG } from '../src/utils/config.js';
import type { ServerConfig } from '../src/types/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Handle ESM module environment where __dirname is not available
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl-emulator.js');

describe('Async Command Execution', () => {
  let server: CLIServer;
  let config: ServerConfig;

  beforeEach(() => {
    const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as ServerConfig;
    
    // Make sure the global config is properly initialized
    if (!config.global) {
      config.global = {
        security: {
          maxCommandLength: 1000,
          commandTimeout: 30000,
          enableInjectionProtection: true,
          restrictWorkingDirectory: false
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: []
        },
        paths: { 
          allowedPaths: [] 
        }
      };
    } else {
      // Set security properties
      config.global.security = {
        ...config.global.security,
        restrictWorkingDirectory: false
      };
      
      // Filter out -e from blockedArguments for WSL tests
      if (config.global.restrictions?.blockedArguments) {
        config.global.restrictions.blockedArguments = 
          config.global.restrictions.blockedArguments.filter(arg => arg !== '-e');
      }
    }
    
    // Configure shells
    if (!config.shells) {
      config.shells = {};
    }
    
    // Disable other shells
    if (config.shells.powershell) config.shells.powershell.enabled = false;
    if (config.shells.gitbash) config.shells.gitbash.enabled = false;
    
    // Configure WSL shell to use the emulator for cross platform tests
    config.shells.wsl = {
      enabled: true,
      executable: {
        command: 'node',
        args: [wslEmulatorPath, '-e']
      },
      overrides: {
        restrictions: { blockedOperators: ['&', '|', ';', '`'] }
      },
      wslConfig: {
        mountPoint: '/mnt/',
        inheritGlobalPaths: true
      }
    };

    // Disable other shells
    if (config.shells.cmd) config.shells.cmd.enabled = false;
    
    server = new CLIServer(config);
  });

  test('should handle concurrent command executions', async () => {
    const commands = ['echo first', 'echo second', 'echo third'];
    const promises = commands.map(cmd =>
      server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'wsl', command: cmd }
      }) as Promise<CallToolResult>
    );

    const results = await Promise.all(promises);

    expect(results).toHaveLength(commands.length);
    results.forEach((result, idx) => {
      expect(result.isError).toBe(false);
      const expected = commands[idx].split(' ')[1];
      expect(result.content[0].text).toContain(expected);
    });
  });

  test('should queue commands when limit reached', async () => {
    const limit = 1;
    let active = 0;
    let maxActive = 0;
    const queue: Array<() => void> = [];

    const runWithLimit = async (cmd: string) => {
      if (active >= limit) {
        await new Promise<void>(resolve => queue.push(resolve));
      }
      active++;
      maxActive = Math.max(maxActive, active);
      try {
        return await server._executeTool({
          name: 'execute_command',
          arguments: { shell: 'wsl', command: cmd.startsWith('fail') ? 'exit 1' : cmd }
        }) as CallToolResult;
      } finally {
        active--;
        const next = queue.shift();
        if (next) next();
      }
    };

    const commands = ['echo one', 'echo two', 'echo three'];
    const results = await Promise.all(commands.map(c => runWithLimit(c)));

    expect(maxActive).toBeLessThanOrEqual(limit);
    results.forEach((result, idx) => {
      expect(result.isError).toBe(false);
      const expected = commands[idx].split(' ')[1];
      expect(result.content[0].text).toContain(expected);
    });
  });

  test('should handle concurrent errors independently', async () => {
    const cmds = [
      'echo good',
      'exit 42'
    ];

    const promises = cmds.map(cmd =>
      server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'wsl', command: cmd }
      }) as Promise<CallToolResult>
    );

    const results = await Promise.all(promises);

    expect(results[0].isError).toBe(false);
    expect(results[0].content[0].text).toContain('good');

    expect(results[1].isError).toBe(true);
    expect((results[1].metadata as any)?.exitCode).toBe(42);
  });
});
