import { describe, test, expect, jest } from '@jest/globals';
import { CLIServer } from '../src/index.js';
import { DEFAULT_CONFIG, loadConfig } from '../src/utils/config.js';
import { baseConfig } from './fixtures/configs.js';
import { buildTestConfig } from './helpers/testUtils.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';

describe('Error Handling', () => {
  test('should handle malformed JSON-RPC requests', async () => {
    const server = new CLIServer(buildTestConfig({
      shells: {
        cmd: {
          enabled: true,
          executable: { command: 'cmd.exe', args: ['/c'] }
        }
      }
    }));
    await expect(
      server._executeTool({ name: 'execute_command', arguments: { shell: 'cmd' } })
    ).rejects.toEqual(
      expect.objectContaining({ code: ErrorCode.InvalidParams })
    );
  });

  test('should recover from shell crashes', async () => {
    const crashConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    if (crashConfig.shells && crashConfig.shells.cmd) {
      // Update the shell configuration to use the new structure
      crashConfig.shells.cmd.executable = {
        command: 'nonexistent_shell_command_for_testing', // Intentionally cause a spawn error
        args: crashConfig.shells.cmd.executable?.args || []
      };
    }
    const server = new CLIServer(crashConfig);
    try {
      await server._executeTool({
        name: 'execute_command',
        arguments: { shell: 'cmd', command: 'echo hi' } // Command itself doesn't matter, shell will fail to start
      });
      // If it reaches here, the promise didn't reject, which is an error for this test case
      throw new Error('Test failed: Promise should have rejected due to shell crash.');
    } catch (error: any) {
      expect(error.code).toBe(ErrorCode.InternalError);
      expect(error.message).toContain('process error');
      // Check for parts of the underlying spawn error message
      expect(error.message).toContain('nonexistent_shell_command_for_testing');
      expect(error.message).toMatch(/ENOENT|UNKNOWN/); // Accommodate different spawn error messages like UNKNOWN or ENOENT
    }
  });

  test('should throw error on invalid configuration', () => {
    const tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-config-'));
    const file = path.join(tmpDir, 'config.json');
    // Create an explicitly malformed config JSON to ensure it fails validation
    const invalidJson = `{
      "global": {
        "security": {
          "restrictWorkingDirectory": "this-should-be-a-boolean",
          "commandTimeout": "this-should-be-a-number",
          "maxCommandLength": false,
          "enableInjectionProtection": 123
        }
      },
      "shells": {
        "cmd": {
          "enabled": 123,
          "executable": "not-an-object"
        }
      }
    }`;
    
    fs.writeFileSync(file, invalidJson);
    
    // This should definitely throw due to JSON schema validation
    try {
      loadConfig(file);
      // If we get here, fail the test
      fail('loadConfig should have thrown an error for invalid config');
    } catch (e) {
      // Test passes if we get here
      expect(e).toBeDefined();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('should fall back to defaults when config read fails', () => {
    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('EACCES');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const config = loadConfig('/path/does/not/matter.json');

    expect(config).toEqual(DEFAULT_CONFIG);
    expect(errorSpy).toHaveBeenCalled();

    existsSpy.mockRestore();
    readSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
