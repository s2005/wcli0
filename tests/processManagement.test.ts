import { describe, test, expect, jest, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { EventEmitter } from 'events';
import { buildTestConfig } from './helpers/testUtils.js';
import { mockWindowsPaths } from './helpers/pathHelpers.js';

const spawnMock = jest.fn();

jest.unstable_mockModule('child_process', () => ({ spawn: spawnMock }));

let CLIServer: typeof import('../src/index.js').CLIServer;

beforeAll(async () => {
  ({ CLIServer } = await import('../src/index.js'));
});

mockWindowsPaths();

beforeEach(() => {
  spawnMock.mockReset();
});

afterAll(() => {
  jest.unmock('child_process');
});

describe('Process Management', () => {
  test('should terminate process on timeout', async () => {
    jest.useFakeTimers();
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = jest.fn();
    spawnMock.mockReturnValue(proc);

    const server = new CLIServer(buildTestConfig({
      global: {
        security: { commandTimeout: 1, maxCommandLength: 8192, enableInjectionProtection: true, restrictWorkingDirectory: false },
        paths: { allowedPaths: [] },
        restrictions: { blockedCommands: [], blockedArguments: [], blockedOperators: [] }
      },
      shells: {
        cmd: {
          enabled: true,
          executable: {
            command: 'cmd.exe',
            args: ['/c']
          }
        }
      }
    }));
    const execPromise = server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'cmd', command: 'echo hi' }
    });

    jest.advanceTimersByTime(1000);
    await expect(execPromise).rejects.toThrow('timed out');
    expect(proc.kill).toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('should handle process spawn errors gracefully', async () => {
    spawnMock.mockImplementation(() => { throw new Error('spawn fail'); });

    const server = new CLIServer(buildTestConfig({
      global: {
        security: { commandTimeout: 60, maxCommandLength: 8192, enableInjectionProtection: true, restrictWorkingDirectory: false },
        paths: { allowedPaths: [] },
        restrictions: { blockedCommands: [], blockedArguments: [], blockedOperators: [] }
      },
      shells: {
        cmd: {
          enabled: true,
          executable: {
            command: 'cmd.exe',
            args: ['/c']
          }
        }
      }
    }));
    await expect(server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'cmd', command: 'echo hi' }
    })).rejects.toThrow('Failed to start cmd process: spawn fail');
  });

  test('should propagate shell process errors', async () => {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = jest.fn();
    spawnMock.mockReturnValue(proc);

    const server = new CLIServer(buildTestConfig({
      global: {
        security: { commandTimeout: 60, maxCommandLength: 8192, enableInjectionProtection: true, restrictWorkingDirectory: false },
        paths: { allowedPaths: [] },
        restrictions: { blockedCommands: [], blockedArguments: [], blockedOperators: [] }
      },
      shells: {
        cmd: {
          enabled: true,
          executable: {
            command: 'cmd.exe',
            args: ['/c']
          }
        }
      }
    }));
    const execPromise = server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'cmd', command: 'echo hi' }
    });

    proc.emit('error', new Error('boom'));
    await expect(execPromise).rejects.toThrow('cmd process error: boom');
  });

  test('should clear timeout when process exits normally', async () => {
    jest.useFakeTimers();
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = jest.fn();
    spawnMock.mockReturnValue(proc);

    const server = new CLIServer(buildTestConfig({
      global: {
        security: { commandTimeout: 2, maxCommandLength: 8192, enableInjectionProtection: true, restrictWorkingDirectory: false },
        paths: { allowedPaths: [] },
        restrictions: { blockedCommands: [], blockedArguments: [], blockedOperators: [] }
      },
      shells: {
        cmd: {
          enabled: true,
          executable: {
            command: 'cmd.exe',
            args: ['/c']
          }
        }
      }
    }));
    const execPromise = server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'cmd', command: 'echo hi' }
    });

    proc.emit('close', 0);
    jest.advanceTimersByTime(2000);
    const result = await execPromise;
    expect(result.isError).toBe(false);
    expect(proc.kill).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
