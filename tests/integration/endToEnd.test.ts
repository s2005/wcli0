import { describe, test, expect } from '@jest/globals';
import { TestCLIServer } from '../helpers/TestCLIServer.js';
import type { ServerConfig } from '../../src/types/config.js';

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

describe('Environment Profiles', () => {
  function makeServer(profiles: ServerConfig['profiles']): TestCLIServer {
    return new TestCLIServer({
      global: {
        security: {
          restrictWorkingDirectory: false,
          maxCommandLength: 8192,
          commandTimeout: 60,
          enableInjectionProtection: true
        },
        paths: { allowedPaths: [] },
        restrictions: {
          blockedCommands: [],
          blockedArguments: [],
          blockedOperators: []
        }
      },
      profiles
    });
  }

  test('injects a profile env value into the spawned environment', async () => {
    const server = makeServer({
      ora: { env: { WCLI_PROFILE_TEST: 'profile-value' } }
    });

    const result = await server.executeCommand({
      shell: 'wsl',
      command: 'printenv WCLI_PROFILE_TEST',
      workingDir: '/tmp',
      profile: 'ora'
    });

    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toBe('profile-value');
  });

  test('prepends to PATH via ${PATH} interpolation', async () => {
    const server = makeServer({
      ora: { env: { PATH: '/opt/oracle/19/bin:${PATH}' } }
    });

    const result = await server.executeCommand({
      shell: 'wsl',
      command: 'printenv PATH',
      workingDir: '/tmp',
      profile: 'ora'
    });

    expect(result.exitCode).toBe(0);
    expect(result.output.trim().startsWith('/opt/oracle/19/bin:')).toBe(true);
    expect(result.output.trim().length).toBeGreaterThan('/opt/oracle/19/bin:'.length);
  });

  test('unknown profile returns an InvalidParams error listing valid names', async () => {
    const server = makeServer({
      ora: { env: { WCLI_PROFILE_TEST: 'profile-value' } }
    });

    await expect(
      server.executeCommand({
        shell: 'wsl',
        command: 'printenv WCLI_PROFILE_TEST',
        workingDir: '/tmp',
        profile: 'does_not_exist'
      })
    ).rejects.toThrow(/Unknown profile 'does_not_exist'[\s\S]*ora/);
  });

  test('no-profile call leaves the profile variable unset', async () => {
    const server = makeServer({
      ora: { env: { WCLI_PROFILE_TEST: 'profile-value' } }
    });

    const result = await server.executeCommand({
      shell: 'wsl',
      command: 'printenv WCLI_PROFILE_TEST',
      workingDir: '/tmp'
    });

    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toBe('');
  });
});
