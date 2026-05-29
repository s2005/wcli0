import { describe, test, expect, jest } from '@jest/globals';
import { CLIServer } from '../../src/index.js';
import type { SessionState } from '../../src/index.js';
import { buildTestConfig } from '../helpers/testUtils.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// P7: in SSE mode each connection gets its own MCP server instance, but the
// handlers still close over the same CLIServer. The active working directory
// must therefore live in a per-session SessionState rather than a single shared
// field, so set_current_directory in one client cannot redirect another.
describe('SSE per-session active directory isolation (P7)', () => {
  function makeServer(): CLIServer {
    const config = buildTestConfig({
      global: {
        security: { restrictWorkingDirectory: false },
        paths: { allowedPaths: [] },
      },
    });
    return new CLIServer(config);
  }

  test('set_current_directory in one session does not affect another', async () => {
    const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
    const server = makeServer();
    // The primary session is seeded from process.cwd() at construction; capture
    // it so we can prove the SSE sessions never mutate it.
    const primaryBefore = (server as any).serverActiveCwd;

    const sessionA: SessionState = { activeCwd: undefined };
    const sessionB: SessionState = { activeCwd: undefined };

    await server._executeTool(
      { name: 'set_current_directory', arguments: { path: 'C:\\dirA' } },
      sessionA
    );
    await server._executeTool(
      { name: 'set_current_directory', arguments: { path: 'C:\\dirB' } },
      sessionB
    );

    const a = (await server._executeTool(
      { name: 'get_current_directory', arguments: {} },
      sessionA
    )) as CallToolResult;
    const b = (await server._executeTool(
      { name: 'get_current_directory', arguments: {} },
      sessionB
    )) as CallToolResult;

    expect(a.content[0].text).toBe('C:\\dirA');
    expect(b.content[0].text).toBe('C:\\dirB');
    // The primary (stdio/default) session is untouched by the SSE sessions.
    expect((server as any).serverActiveCwd).toBe(primaryBefore);
    expect((server as any).serverActiveCwd).not.toBe('C:\\dirA');
    expect((server as any).serverActiveCwd).not.toBe('C:\\dirB');

    chdirSpy.mockRestore();
  });

  test('execute_command uses the calling session cwd, not another session cwd', async () => {
    const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
    const server = makeServer();

    const sessionA: SessionState = { activeCwd: undefined };
    const sessionB: SessionState = { activeCwd: undefined };

    await server._executeTool(
      { name: 'set_current_directory', arguments: { path: 'C:\\dirA' } },
      sessionA
    );
    await server._executeTool(
      { name: 'set_current_directory', arguments: { path: 'C:\\dirB' } },
      sessionB
    );

    // Session A still resolves its own directory after B changed B's directory.
    const a = (await server._executeTool(
      { name: 'get_current_directory', arguments: {} },
      sessionA
    )) as CallToolResult;
    expect(a.content[0].text).toBe('C:\\dirA');

    chdirSpy.mockRestore();
  });

  test('the default session maps to serverActiveCwd for stdio/back-compat', async () => {
    const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});
    const server = makeServer();

    await server._executeTool({
      name: 'set_current_directory',
      arguments: { path: 'C:\\primary' },
    });

    expect((server as any).serverActiveCwd).toBe('C:\\primary');

    chdirSpy.mockRestore();
  });
});
