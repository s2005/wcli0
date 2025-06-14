import { describe, test, expect, jest } from '@jest/globals';
import path from 'path';
import { CLIServer } from '../../src/index.js';
import { buildTestConfig, createWslEmulatorConfig } from '../helpers/testUtils.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

describe('CLIServer Implementation', () => {
  describe('Shell Configuration Resolution', () => {
    test('pre-resolves enabled shell configurations', () => {
      const config = buildTestConfig({
        global: {
          security: { commandTimeout: 30 }
        },
        shells: {
          cmd: {
            enabled: true,
            executable: { command: 'cmd.exe', args: ['/c'] },
            overrides: {
              security: { commandTimeout: 60 }
            }
          },
          powershell: {
            enabled: false,
            executable: { command: 'powershell.exe', args: ['-Command'] }
          }
        }
      });

      const server = new CLIServer(config);

      expect((server as any).resolvedConfigs.has('cmd')).toBe(true);
      expect((server as any).resolvedConfigs.has('powershell')).toBe(false);

      const cmdResolved = (server as any).resolvedConfigs.get('cmd');
      expect(cmdResolved.security.commandTimeout).toBe(60);
    });

    test('lists only enabled shells', () => {
      const config = buildTestConfig({
        shells: {
          cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } },
          wsl: createWslEmulatorConfig(),
          powershell: { enabled: false, executable: { command: 'powershell.exe', args: [] } }
        }
      });

      const server = new CLIServer(config);
      const enabledShells = (server as any).getEnabledShells();

      expect(enabledShells).toContain('cmd');
      expect(enabledShells).toContain('wsl');
      expect(enabledShells).not.toContain('powershell');
    });
  });

  describe('Working Directory Initialization', () => {
    test('uses initialDir from global config', () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
      const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('C:\\other');

      const config = buildTestConfig({
        global: {
          paths: {
            allowedPaths: ['C:\\allowed'],
            initialDir: 'C:\\allowed'
          }
        }
      });

      const server = new CLIServer(config);

      expect(chdirSpy).toHaveBeenCalledWith('C:\\allowed');
      expect((server as any).serverActiveCwd).toBe('C:\\allowed');

      chdirSpy.mockRestore();
      cwdSpy.mockRestore();
    });

    test('validates CWD against global allowed paths', () => {
      const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('C:\\not-allowed');

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: ['C:\\allowed'] }
        }
      });

      const server = new CLIServer(config);

      expect((server as any).serverActiveCwd).toBeUndefined();

      cwdSpy.mockRestore();
    });

    test('handles initializeWorkingDirectory with restrictWorkingDirectory', () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
      const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('C:\\not-allowed');

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: {
            initialDir: 'C:\\not-allowed',
            allowedPaths: ['C:\\allowed', 'D:\\fallback']
          }
        }
      });

      const server = new CLIServer(config);
      // When initial dir is not allowed and restrictWorkingDirectory is true,
      // the serverActiveCwd should be undefined as per our implementation
      expect((server as any).serverActiveCwd).toBeUndefined();

      chdirSpy.mockRestore();
      cwdSpy.mockRestore();
    });
  });

  describe('Command Execution with Context', () => {
    test.skip('uses shell-specific timeout', async () => {
      // Mock the validation functions to always pass, so we can focus on testing timeout
      const validateSpy = jest.spyOn(CLIServer.prototype as any, 'validateSingleCommand')
        .mockImplementation(() => ({ isValid: true }));
      
      // Mock process.chdir to prevent directory validation issues
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
      
      const spawnMock = jest.fn(() => {
        const proc = new (require('events').EventEmitter)();
        proc.stdout = new (require('events').EventEmitter)();
        proc.stderr = new (require('events').EventEmitter)();
        proc.kill = jest.fn();
        // Never emit 'close' event to force timeout
        return proc;
      });

      jest.doMock('child_process', () => ({ spawn: spawnMock }));

      const config = buildTestConfig({
        global: {
          security: { 
            commandTimeout: 30,
            restrictWorkingDirectory: false // Disable path restriction for this test
          },
          paths: { allowedPaths: [process.cwd()] }
        },
        shells: {
          wsl: createWslEmulatorConfig({
            overrides: { security: { commandTimeout: 0.1 } }
          })
        }
      });

      // Import the module directly without isolateModules
      jest.resetModules();
      const { CLIServer: MockedCLIServer } = await import('../../src/index.js');
      
      const server = new MockedCLIServer(config);
      // Set serverActiveCwd manually to bypass directory validation
      (server as any).serverActiveCwd = process.cwd();

      jest.useFakeTimers();

      const resultPromise = server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'wsl', command: 'sleep 5', workingDir: process.cwd() }
      });

      jest.advanceTimersByTime(150);

      await expect(resultPromise).rejects.toThrow(/timed out after 0.1 seconds.*wsl/);

      // Restore all mocks
      validateSpy.mockRestore();
      chdirSpy.mockRestore();
      jest.useRealTimers();
      jest.dontMock('child_process');
    });

    test.skip('validates paths based on shell type', async () => {
      const config = buildTestConfig({
        global: { security: { restrictWorkingDirectory: true } },
        shells: {
          cmd: {
            enabled: true,
            executable: { command: 'cmd.exe', args: ['/c'] },
            overrides: { paths: { allowedPaths: ['C\\Windows'] } }
          },
          wsl: createWslEmulatorConfig({
            overrides: { paths: { allowedPaths: ['/home/user'] } }
          })
        }
      });

      const server = new CLIServer(config);

      await expect(server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'echo test', workingDir: '/home/user' }
      })).rejects.toThrow(/validation failed/);

      await expect(server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'wsl', command: 'echo test', workingDir: 'C\\Windows' }
      })).rejects.toThrow(/validation failed/);
    });
  });
});
