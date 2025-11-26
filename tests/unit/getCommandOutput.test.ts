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

  test('returns requested line range', async () => {
    const config = cloneConfig();
    config.global.logging!.enableLogResources = true;
    server = new CLIServer(config as any);

    const logId = server['logStorage']!.storeLog(
      'echo test',
      'cmd',
      process.cwd(),
      ['a', 'b', 'c', 'd'].join('\n'),
      '',
      0
    );

    const result = await server._executeTool({
      name: 'get_command_output',
      arguments: {
        executionId: logId,
        startLine: 2,
        endLine: 3
      }
    } as any);

    expect(result.isError).toBe(false);
    expect(result.content[0].text.trim()).toBe('b\nc');
    expect(result.metadata?.returnedLines).toBe(2);
    expect(result.metadata?.totalLines).toBe(4); // should report full log length
  });

  test('enforces byte-size guardrail', async () => {
    const config = cloneConfig();
    config.global.logging!.enableLogResources = true;
    config.global.logging!.maxLogSize = 1000; // keep storage lenient
    config.global.logging!.maxReturnBytes = 50; // tighten retrieval guard
    server = new CLIServer(config as any);

    const longLine = 'x'.repeat(60);
    const logId = server['logStorage']!.storeLog(
      'echo long',
      'cmd',
      process.cwd(),
      longLine,
      '',
      0
    );

    const result = await server._executeTool({
      name: 'get_command_output',
      arguments: {
        executionId: logId
      }
    } as any);

    expect(result.isError).toBe(false);
    expect(result.metadata?.truncatedByBytes).toBe(true);
    expect(result.content[0].text).toContain('Output truncated to fit 50 bytes');
  });
});
