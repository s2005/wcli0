import { describe, test, expect, jest } from '@jest/globals';
import { CLIServer } from '../../src/index.js';
import type { SessionState } from '../../src/index.js';
import { buildTestConfig, createWslEmulatorConfig } from '../helpers/testUtils.js';
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

// P11: set_current_directory still calls the process-global process.chdir(), so
// a relative workingDir handed to spawn({ cwd }) would resolve against whatever
// directory the most recent session selected. execute_command must anchor a
// relative workingDir to the calling session's activeCwd so concurrent SSE
// clients cannot perturb one another's relative paths.
describe('SSE per-session relative workingDir isolation (P11)', () => {
  function makeWslServer(): CLIServer {
    const config = buildTestConfig({
      global: {
        security: { restrictWorkingDirectory: false },
        paths: { allowedPaths: [] },
      },
      shells: { wsl: createWslEmulatorConfig() },
    });
    return new CLIServer(config);
  }

  test('a relative workingDir resolves against the calling session, not a shared global cwd', async () => {
    const server = makeWslServer();

    // Capture the workingDir handed to the spawn step without launching a shell.
    const captured: string[] = [];
    jest
      .spyOn(server as any, 'executeShellCommand')
      .mockImplementation((...callArgs: unknown[]) => {
        // executeShellCommand(shellName, shellConfig, command, workingDir, ...)
        captured.push(callArgs[3] as string);
        return Promise.resolve({
          content: [{ type: 'text', text: 'ok' }],
          isError: false,
          metadata: {},
        } as CallToolResult);
      });

    const sessionA: SessionState = { activeCwd: '/mnt/c/dirA' };
    const sessionB: SessionState = { activeCwd: '/mnt/c/dirB' };

    await server._executeTool(
      { name: 'execute_command', arguments: { shell: 'wsl', command: 'echo hi', workingDir: 'sub' } },
      sessionA
    );
    await server._executeTool(
      { name: 'execute_command', arguments: { shell: 'wsl', command: 'echo hi', workingDir: 'sub' } },
      sessionB
    );

    // Identical relative input, but each session anchors to its own activeCwd.
    expect(captured[0]).toBe('/mnt/c/dirA/sub');
    expect(captured[1]).toBe('/mnt/c/dirB/sub');
  });

  test('an absolute workingDir is left untouched', async () => {
    const server = makeWslServer();
    const captured: string[] = [];
    jest
      .spyOn(server as any, 'executeShellCommand')
      .mockImplementation((...callArgs: unknown[]) => {
        captured.push(callArgs[3] as string);
        return Promise.resolve({
          content: [{ type: 'text', text: 'ok' }],
          isError: false,
          metadata: {},
        } as CallToolResult);
      });

    const session: SessionState = { activeCwd: '/mnt/c/dirA' };
    await server._executeTool(
      { name: 'execute_command', arguments: { shell: 'wsl', command: 'echo hi', workingDir: '/mnt/c/other' } },
      session
    );

    expect(captured[0]).toBe('/mnt/c/other');
  });
});
