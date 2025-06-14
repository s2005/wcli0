import { describe, test, expect } from '@jest/globals';
import path from 'path';
import { CLIServer } from '../../src/index.js';
import { buildTestConfig } from '../helpers/testUtils.js';
import { executeListResources, executeReadResource } from '../helpers/testServerUtils.js';

describe('Resource Handler', () => {

  describe('ListResources', () => {
    test('lists all resource types', async () => {
      const config = buildTestConfig({
        shells: {
          cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } },
          wsl: { enabled: true, executable: { command: 'node', args: [path.resolve(process.cwd(), 'scripts/wsl-emulator.js'), '-e'] } }
        }
      });

      const server = new CLIServer(config);
      
      // Execute list resources handler
      const result = await executeListResources(server);
      
      const uris = result.resources.map((r: { uri: string }) => r.uri);
      
      expect(uris).toContain('cli://config');
      expect(uris).toContain('cli://config/global');
      expect(uris).toContain('cli://config/shells/cmd');
      expect(uris).toContain('cli://config/shells/wsl');
      expect(uris).toContain('cli://info/security');
    });

    test('only lists enabled shells', async () => {
      const config = buildTestConfig({
        shells: {
          cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } },
          powershell: { enabled: false, executable: { command: 'powershell.exe', args: [] } }
        }
      });

      const server = new CLIServer(config);
      
      // Execute list resources handler
      const result = await executeListResources(server);
      
      const uris = result.resources.map((r: { uri: string }) => r.uri);
      
      expect(uris).toContain('cli://config/shells/cmd');
      expect(uris).not.toContain('cli://config/shells/powershell');
    });
  });

  describe('ReadResource', () => {
    test('returns full configuration', async () => {
      const config = buildTestConfig({
        global: {
          security: { maxCommandLength: 1500 }
        }
      });

      const server = new CLIServer(config);
      
      // Execute read resource handler
      const result = await executeReadResource(server, 'cli://config');
      
      const content = JSON.parse(result.contents[0].text);
      expect(content.global.security.maxCommandLength).toBe(1500);
    });

    test('returns global configuration only', async () => {
      const config = buildTestConfig({
        global: {
          restrictions: { blockedCommands: ['test-cmd'] }
        },
        shells: {
          cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } }
        }
      });

      const server = new CLIServer(config);
      
      // Execute read resource handler
      const result = await executeReadResource(server, 'cli://config/global');
      
      const content = JSON.parse(result.contents[0].text);
      expect(content.restrictions.blockedCommands).toContain('test-cmd');
      expect(content.shells).toBeUndefined();
    });

    test('returns resolved shell configuration', async () => {
      const config = buildTestConfig({
        global: {
          security: { commandTimeout: 30 },
          restrictions: { blockedCommands: ['global-cmd'] }
        },
        shells: {
          wsl: {
            enabled: true,
            executable: { command: 'node', args: [path.resolve(process.cwd(), 'scripts/wsl-emulator.js'), '-e'] },
            overrides: {
              security: { commandTimeout: 120 },
              restrictions: { blockedCommands: ['wsl-cmd'] }
            }
          }
        }
      });

      const server = new CLIServer(config);
      
      // Execute read resource handler
      const result = await executeReadResource(server, 'cli://config/shells/wsl');
      
      const content = JSON.parse(result.contents[0].text);
      expect(content.shell).toBe('wsl');
      expect(content.effectiveSettings.security.commandTimeout).toBe(120);
      expect(content.effectiveSettings.restrictions.blockedCommands).toEqual(['global-cmd', 'wsl-cmd']);
    });

    test('returns security information summary', async () => {
      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: ['C:\\test'] }
        },
        shells: {
          cmd: { 
            enabled: true, 
            executable: { command: 'cmd.exe', args: ['/c'] },
            overrides: {
              security: { commandTimeout: 45 }
            }
          }
        }
      });

      const server = new CLIServer(config);
      
      // Execute read resource handler
      const result = await executeReadResource(server, 'cli://info/security');
      
      const content = JSON.parse(result.contents[0].text);
      expect(content.globalSettings.restrictWorkingDirectory).toBe(true);
      expect(content.globalAllowedPaths).toContain('C:\\test');
      expect(content.enabledShells).toContain('cmd');
      expect(content.shellSpecificSettings.cmd.timeout).toBe(45);
    });

    test('returns error for unknown resource', async () => {
      const config = buildTestConfig();
      const server = new CLIServer(config);
      
      // Execute read resource handler and expect error
      await expect(executeReadResource(server, 'cli://unknown')).rejects.toThrow('Unknown resource URI');
    });

    test('returns error for disabled shell resource', async () => {
      const config = buildTestConfig({
        shells: {
          cmd: { enabled: false, executable: { command: 'cmd.exe', args: [] } }
        }
      });

      const server = new CLIServer(config);
      
      // Execute read resource handler and expect error
      await expect(executeReadResource(server, 'cli://config/shells/cmd')).rejects.toThrow('not found or not enabled');
    });
  });
});
