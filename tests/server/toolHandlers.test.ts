import { describe, test, expect, jest } from '@jest/globals';
import path from 'path';
import { CLIServer } from '../../src/index.js';
import { buildTestConfig } from '../helpers/testUtils.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

describe('Tool Handlers', () => {
  describe('get_config tool', () => {
    test('returns both configuration and resolved settings', async () => {
      const config = buildTestConfig({
        global: {
          security: { commandTimeout: 30 },
          restrictions: { blockedCommands: ['global-blocked'] }
        },
        shells: {
          cmd: {
            enabled: true,
            executable: { command: 'cmd.exe', args: ['/c'] },
            overrides: {
              security: { commandTimeout: 60 },
              restrictions: { blockedCommands: ['cmd-specific'] }
            }
          }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({ name: 'get_config', arguments: {} }) as CallToolResult;

      const configData = JSON.parse(result.content[0].text as string);

      expect(configData.configuration.global.security.commandTimeout).toBe(30);
      expect(configData.configuration.shells.cmd.overrides.security.commandTimeout).toBe(60);
      expect(configData.resolvedShells.cmd.effectiveSettings.security.commandTimeout).toBe(60);
      expect(configData.resolvedShells.cmd.effectiveSettings.restrictions.blockedCommands)
        .toEqual(['global-blocked', 'cmd-specific']);
    });
  });

  describe('validate_directories tool', () => {
    test('supports shell-specific validation', async () => {
      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: ['C:\\global'] }
        },
        shells: {
          wsl: {
            enabled: true,
            executable: { command: 'node', args: [path.resolve(process.cwd(), 'scripts/wsl-emulator.js'), '-e'] },
            overrides: { paths: { allowedPaths: ['/home/user', '/tmp'] } }
          }
        }
      });

      const server = new CLIServer(config);

      const globalResult = await server._executeTool({
        name: 'validate_directories',
        arguments: { directories: ['C:\\global\\sub', 'C:\\other'] }
      }) as CallToolResult;

      expect(globalResult.isError).toBe(true);
      expect(globalResult.content[0].text).toContain('C:\\other');

      const wslResult = await server._executeTool({
        name: 'validate_directories',
        arguments: { directories: ['/home/user/work', '/usr/local'], shell: 'wsl' }
      }) as CallToolResult;

      expect(wslResult.isError).toBe(true);
      expect(wslResult.content[0].text).toContain('/usr/local');
      expect(wslResult.content[0].text).toContain('wsl');
    });
  });

  describe('set_current_directory tool', () => {
    test('validates against global allowed paths', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: ['C:\\allowed'] }
        }
      });

      const server = new CLIServer(config);

      const successResult = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: 'C:\\allowed\\sub' }
      }) as CallToolResult;

      expect(successResult.isError).toBe(false);
      expect(chdirSpy).toHaveBeenCalledWith('C:\\allowed\\sub');
      expect((server as any).serverActiveCwd).toBe('C:\\allowed\\sub');

      const failResult = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: 'C:\\not-allowed' }
      }) as CallToolResult;

      expect(failResult.isError).toBe(true);
      expect(failResult.content[0].text).toContain('must be within allowed paths');

      chdirSpy.mockRestore();
    });
  });
});
