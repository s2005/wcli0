import { describe, test, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
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

describe('Git Bash working directory handling', () => {
  test('converts Git Bash style path to Windows format for spawn cwd', async () => {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    spawnMock.mockReturnValue(proc);

    const server = new CLIServer(buildTestConfig({
      global: { security: { restrictWorkingDirectory: false } },
      shells: {
        gitbash: { enabled: true, executable: { command: 'bash.exe', args: ['-c'] } },
        cmd: { enabled: false },
        powershell: { enabled: false },
        wsl: { enabled: false }
      }
    }));

    const execPromise = server._executeTool({
      name: 'execute_command',
      arguments: { shell: 'gitbash', command: 'echo hi', workingDir: '/d/testdir' }
    });

    proc.emit('close', 0);

    const result = await execPromise as any;
    expect(result.isError).toBe(false);
    expect(spawnMock).toHaveBeenCalled();
    const spawnOptions = spawnMock.mock.calls[0][2];
    expect(spawnOptions.cwd).toBe('D:\\testdir');
    expect(result.metadata.workingDirectory).toBe('/d/testdir');
  });
});
