import { describe, test, expect } from '@jest/globals';
import { validateWorkingDirectory } from '../src/utils/pathValidation.js';
import { createValidationContext } from '../src/utils/validationContext.js';
import type { ResolvedShellConfig } from '../src/types/config.js';

function makeConfig(shell: 'wsl' | 'gitbash', allowed: string[]): ResolvedShellConfig {
  const base: ResolvedShellConfig = {
    type: shell,
    enabled: true,
    executable: { command: 'test.exe', args: [] },
    security: { maxCommandLength: 1000, commandTimeout: 30, enableInjectionProtection: true, restrictWorkingDirectory: true },
    restrictions: { blockedCommands: [], blockedArguments: [], blockedOperators: [] },
    paths: { allowedPaths: allowed, initialDir: undefined }
  } as ResolvedShellConfig;
  if (shell === 'wsl') {
    (base as any).wslConfig = { mountPoint: '/mnt/', inheritGlobalPaths: true };
  }
  return base;
}

describe('validateWorkingDirectory edge cases', () => {
  test('WSL converts Windows paths before validation', () => {
    const cfg = makeConfig('wsl', ['/mnt/c/Users']);
    const ctx = createValidationContext('wsl', cfg);
    expect(() => validateWorkingDirectory('C:\\Users', ctx)).not.toThrow();
  });

  test('WSL rejects paths outside allowed list after conversion', () => {
    const cfg = makeConfig('wsl', ['/mnt/c/Allowed']);
    const ctx = createValidationContext('wsl', cfg);
    expect(() => validateWorkingDirectory('D:\\Other', ctx)).toThrow(/allowed paths/);
  });

  test('GitBash accepts Windows and Unix style paths', () => {
    const cfg = makeConfig('gitbash', ['C:\\Users']);
    const ctx = createValidationContext('gitbash', cfg);
    expect(() => validateWorkingDirectory('/c/Users', ctx)).not.toThrow();
    expect(() => validateWorkingDirectory('C:\\Users', ctx)).not.toThrow();
  });
  test("GitBash converts allowed Unix paths to Windows for comparison", () => {
    const cfg = makeConfig("gitbash", ["/c/Allowed"]);
    const ctx = createValidationContext("gitbash", cfg);
    expect(() => validateWorkingDirectory("C:\\Allowed", ctx)).not.toThrow();
  });

  test('throws when allowedPaths empty', () => {
    const cfg = makeConfig('gitbash', []);
    const ctx = createValidationContext('gitbash', cfg);
    expect(() => validateWorkingDirectory('/c/Users', ctx)).toThrow(/No allowed paths configured/);
  });
});
