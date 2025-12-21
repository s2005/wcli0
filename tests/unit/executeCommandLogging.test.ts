import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import { setDebugLogging } from '../../src/utils/log.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../../src/types/config.js';

describe('execute_command logging', () => {
  let server: CLIServer;
  let consoleSpy: jest.SpyInstance;

  const buildConfig = (): ServerConfig => {
    const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as ServerConfig;
    config.global.security.restrictWorkingDirectory = false;
    config.global.paths.allowedPaths = [];

    const gitbashConfig = config.shells.gitbash;
    if (!gitbashConfig) {
      throw new Error('gitbash shell config is required for this test');
    }

    gitbashConfig.overrides = {
      ...gitbashConfig.overrides,
      security: {
        ...(gitbashConfig.overrides?.security || {}),
        maxCommandLength: 10,
        restrictWorkingDirectory: false
      }
    };

    return config;
  };

  beforeEach(() => {
    setDebugLogging(true);
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    server?.['logStorage']?.stopCleanup();
    consoleSpy?.mockRestore();
    setDebugLogging(false);
  });

  test('stores a log entry and emits debug output when validation fails', async () => {
    const config = buildConfig();
    server = new CLIServer(config);

    const longCommand = 'echo ' + 'a'.repeat(20);

    await expect(
      server._executeTool({
        name: 'execute_command',
        arguments: {
          shell: 'gitbash',
          command: longCommand,
          workingDir: '/tmp'
        }
      } as any)
    ).rejects.toBeInstanceOf(McpError);

    const logs = server['logStorage']!.listLogs();
    const validationLog = logs.find(log => log.command === longCommand);

    expect(validationLog).toBeDefined();
    expect(validationLog?.exitCode).toBe(-1);
    expect(validationLog?.stderr).toContain('Command exceeds maximum length');

    const errorCalls = consoleSpy.mock.calls.flatMap(call => call.map(arg => String(arg)));
    const containsCommandLog = errorCalls.some(message => message.includes(longCommand));

    expect(containsCommandLog).toBe(true);
  });
});
