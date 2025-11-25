import { CLIServer } from '../../src/index.js';
import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import type { ServerConfig } from '../../src/types/config.js';

const cloneConfig = (): ServerConfig => {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as ServerConfig;
  for (const key of Object.keys(DEFAULT_CONFIG.shells) as Array<keyof ServerConfig['shells']>) {
    const original = (DEFAULT_CONFIG.shells as any)[key];
    if (original?.validatePath) {
      (cloned.shells as any)[key].validatePath = original.validatePath;
    }
  }
  return cloned;
};

describe('get_command_output tool', () => {
  let server: CLIServer;

  afterEach(() => {
    server?.['logStorage']?.stopCleanup();
  });

  test('returns structured error for invalid regex', async () => {
    const config = cloneConfig();
    config.global.logging!.enableLogResources = true;
    server = new CLIServer(config as any);

    const logId = server['logStorage']!.storeLog('echo test', 'cmd', process.cwd(), 'hello world', '', 0);

    await expect(
      server._executeTool({
        name: 'get_command_output',
        arguments: {
          executionId: logId,
          search: '['
        }
      } as any)
    ).rejects.toBeInstanceOf(McpError);
  });
});
