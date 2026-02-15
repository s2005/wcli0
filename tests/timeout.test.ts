import { describe, test, expect, jest } from '@jest/globals';
import { CLIServer } from '../src/index.js';
import { buildTestConfig, createWslEmulatorConfig } from './helpers/testUtils.js';
import { executeListTools } from './helpers/testServerUtils.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';

describe('Per-Command Timeout Feature', () => {
  describe('Tool Schema', () => {
    test('includes timeout parameter in execute_command schema', async () => {
      const config = buildTestConfig({
        shells: {
          wsl: createWslEmulatorConfig(),
          cmd: { enabled: true, executable: { command: 'cmd.exe', args: ['/c'] } }
        }
      });

      const server = new CLIServer(config);
      const result = await executeListTools(server);

      const executeCommandTool = result.tools.find((t: any) => t.name === 'execute_command');
      expect(executeCommandTool).toBeDefined();

      const schema = executeCommandTool.inputSchema;
      expect(schema.properties.timeout).toBeDefined();
      expect(schema.properties.timeout.type).toBe('number');
      expect(schema.properties.timeout.description).toContain('Command timeout in seconds');
      expect(schema.properties.timeout.description).toContain('1 and 3,600');
    });

    test('timeout is optional in schema', async () => {
      const config = buildTestConfig({
        shells: {
          wsl: createWslEmulatorConfig()
        }
      });

      const server = new CLIServer(config);
      const result = await executeListTools(server);

      const executeCommandTool = result.tools.find((t: any) => t.name === 'execute_command');
      const required = executeCommandTool.inputSchema.required;
      expect(required).toContain('shell');
      expect(required).toContain('command');
      expect(required).not.toContain('timeout');
    });
  });

  describe('Timeout Validation', () => {
    let server: CLIServer;

    beforeEach(() => {
      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: false },
          paths: { allowedPaths: [process.cwd()] }
        },
        shells: {
          wsl: createWslEmulatorConfig({
            overrides: { security: { commandTimeout: 30 } }
          })
        }
      });

      server = new CLIServer(config);
      (server as any).serverActiveCwd = process.cwd();
    });

    test('rejects non-integer timeout values', async () => {
      await expect(server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'wsl',
          command: 'echo test',
          workingDir: process.cwd(),
          timeout: 30.5
        }
      })).rejects.toEqual(
        expect.objectContaining({
          code: ErrorCode.InvalidRequest,
          message: expect.stringContaining('timeout must be an integer')
        })
      );
    });

    test('rejects timeout less than 1', async () => {
      await expect(server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'wsl',
          command: 'echo test',
          workingDir: process.cwd(),
          timeout: 0
        }
      })).rejects.toEqual(
        expect.objectContaining({
          code: ErrorCode.InvalidRequest,
          message: expect.stringContaining('timeout must be at least 1 second')
        })
      );
    });

    test('rejects negative timeout', async () => {
      await expect(server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'wsl',
          command: 'echo test',
          workingDir: process.cwd(),
          timeout: -5
        }
      })).rejects.toEqual(
        expect.objectContaining({
          code: ErrorCode.InvalidRequest,
          message: expect.stringContaining('timeout must be at least 1 second')
        })
      );
    });

    test('rejects timeout greater than 3600', async () => {
      await expect(server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'wsl',
          command: 'echo test',
          workingDir: process.cwd(),
          timeout: 4000
        }
      })).rejects.toEqual(
        expect.objectContaining({
          code: ErrorCode.InvalidRequest,
          message: expect.stringContaining('timeout cannot exceed 3600 seconds')
        })
      );
    });

    test('rejects boundary value of 3601', async () => {
      await expect(server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'wsl',
          command: 'echo test',
          workingDir: process.cwd(),
          timeout: 3601
        }
      })).rejects.toEqual(
        expect.objectContaining({
          code: ErrorCode.InvalidRequest,
          message: expect.stringContaining('timeout cannot exceed 3600 seconds')
        })
      );
    });
  });

  describe('Timeout Parameter Passing', () => {
    let server: CLIServer;

    beforeEach(() => {
      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: false },
          paths: { allowedPaths: [process.cwd()] }
        },
        shells: {
          cmd: {
            enabled: true,
            executable: { command: 'cmd.exe', args: ['/c'] }
          }
        }
      });

      server = new CLIServer(config);
      (server as any).serverActiveCwd = process.cwd();
    });

    test('timeout parameter is optional and command executes without it', async () => {
      // This test verifies that commands still work when timeout is not provided
      // We just verify validation passes
      const args = {
        shell: 'cmd',
        command: 'echo test',
        workingDir: process.cwd()
      };

      // Parse the arguments to verify schema accepts it
      const zodParse = jest.spyOn((server as any), 'validateCommand' as any).mockImplementation(() => {});

      // Command should not throw validation error for missing timeout
      const promise = server._executeTool({
        name: 'execute_command',
        arguments: args
      });

      // We don't need to actually execute, just verify it doesn't throw during validation
      zodParse.mockRestore();

      // The command might fail due to cmd.exe not being available, but it shouldn't fail due to missing timeout
      try {
        await promise;
      } catch (error: any) {
        // If it fails, it should not be due to missing timeout
        expect(error.message).not.toContain('timeout');
      }
    });

    test('timeout value of 1 is accepted', async () => {
      // Test minimum boundary
      const promise = server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'cmd',
          command: 'echo test',
          workingDir: process.cwd(),
          timeout: 1
        }
      });

      try {
        await promise;
      } catch (error: any) {
        // If it fails, it should not be due to timeout validation
        expect(error.message).not.toContain('timeout');
      }
    });

    test('timeout value of 3600 is accepted', async () => {
      // Test maximum boundary
      const promise = server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'cmd',
          command: 'echo test',
          workingDir: process.cwd(),
          timeout: 3600
        }
      });

      try {
        await promise;
      } catch (error: any) {
        // If it fails, it should not be due to timeout validation
        expect(error.message).not.toContain('timeout');
      }
    });

    test('common timeout values are accepted', async () => {
      const timeoutValues = [10, 30, 60, 120, 300, 600, 1800];

      for (const timeout of timeoutValues) {
        const promise = server._executeTool({
          name: 'execute_command',
          arguments: {
            shell: 'cmd',
            command: 'echo test',
            workingDir: process.cwd(),
            timeout
          }
        });

        try {
          await promise;
        } catch (error: any) {
          // If it fails, it should not be due to timeout validation
          expect(error.message).not.toContain('timeout');
        }
      }
    });
  });

  describe('Integration with maxOutputLines', () => {
    let server: CLIServer;

    beforeEach(() => {
      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: false },
          paths: { allowedPaths: [process.cwd()] }
        },
        shells: {
          cmd: {
            enabled: true,
            executable: { command: 'cmd.exe', args: ['/c'] }
          }
        }
      });

      server = new CLIServer(config);
      (server as any).serverActiveCwd = process.cwd();
    });

    test('accepts both timeout and maxOutputLines together', async () => {
      const promise = server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'cmd',
          command: 'echo test',
          workingDir: process.cwd(),
          timeout: 60,
          maxOutputLines: 100
        }
      });

      try {
        await promise;
      } catch (error: any) {
        // If it fails, it should not be due to timeout or maxOutputLines validation
        expect(error.message).not.toContain('timeout');
        expect(error.message).not.toContain('maxOutputLines');
      }
    });

    test('accepts workingDir, timeout, and maxOutputLines together', async () => {
      const promise = server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'cmd',
          command: 'echo test',
          workingDir: process.cwd(),
          timeout: 120,
          maxOutputLines: 50
        }
      });

      try {
        await promise;
      } catch (error: any) {
        expect(error.message).not.toContain('timeout');
        expect(error.message).not.toContain('maxOutputLines');
      }
    });
  });

  describe('Error Messages', () => {
    let server: CLIServer;

    beforeEach(() => {
      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: false },
          paths: { allowedPaths: [process.cwd()] }
        },
        shells: {
          cmd: {
            enabled: true,
            executable: { command: 'cmd.exe', args: ['/c'] }
          }
        }
      });

      server = new CLIServer(config);
      (server as any).serverActiveCwd = process.cwd();
    });

    test('provides clear error message for non-integer timeout', async () => {
      await expect(server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'cmd',
          command: 'echo test',
          timeout: 30.5
        }
      })).rejects.toMatchObject({
        code: ErrorCode.InvalidRequest,
        message: expect.stringMatching(/timeout must be an integer.*number/)
      });
    });

    test('provides clear error message for timeout too small', async () => {
      await expect(server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'cmd',
          command: 'echo test',
          timeout: 0
        }
      })).rejects.toMatchObject({
        code: ErrorCode.InvalidRequest,
        message: expect.stringMatching(/timeout must be at least 1 second.*0/)
      });
    });

    test('provides clear error message for timeout too large', async () => {
      await expect(server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'cmd',
          command: 'echo test',
          timeout: 5000
        }
      })).rejects.toMatchObject({
        code: ErrorCode.InvalidRequest,
        message: expect.stringMatching(/timeout cannot exceed 3600 seconds.*5000/)
      });
    });
  });
});
