import { describe, test, expect } from '@jest/globals';
import { TestCLIServer } from '../helpers/TestCLIServer.js';

describe('End-to-End Scenarios', () => {
  test('should execute shell command with proper isolation', async () => {
    const server = new TestCLIServer({
      global: {
        security: {
          restrictWorkingDirectory: false,
          maxCommandLength: 8192,
          commandTimeout: 60,
          enableInjectionProtection: true
        },
        paths: {
          allowedPaths: []
        },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: []
        }
      }
    });
    const result = await server.executeCommand({
      shell: 'wsl',
      command: 'echo integration-test',
      workingDir: '/tmp'
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('integration-test');
    expect(result.workingDirectory).toBe('/tmp');
  });
});
