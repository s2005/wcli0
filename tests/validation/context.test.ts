import { describe, test, expect } from '@jest/globals';
import { createValidationContext } from '../../src/utils/validationContext';
import { ResolvedShellConfig } from '../../src/types/config';

// Helper to create mock shell configs
function createMockShellConfig(overrides: Partial<ResolvedShellConfig> = {}): ResolvedShellConfig {
  return {
    enabled: true,
    executable: { command: 'test.exe', args: [] },
    security: {
      maxCommandLength: 1000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true
    },
    restrictions: {
      blockedCommands: ['badcmd'],
      blockedArguments: ['--bad'],
      blockedOperators: ['&']
    },
    paths: {
      allowedPaths: ['C:\\test', 'D:\\test'],
      initialDir: undefined
    },
    ...overrides
  };
}

describe('ValidationContext', () => {
  test('createValidationContext creates context with correct shell type flags', () => {
    // Windows shell (cmd)
    const cmdContext = createValidationContext('cmd', createMockShellConfig());
    expect(cmdContext.isWindowsShell).toBe(true);
    expect(cmdContext.isUnixShell).toBe(false);
    expect(cmdContext.isWslShell).toBe(false);
    
    // Unix shell (gitbash)
    const gitbashContext = createValidationContext('gitbash', createMockShellConfig());
    expect(gitbashContext.isWindowsShell).toBe(false);
    expect(gitbashContext.isUnixShell).toBe(true);
    expect(gitbashContext.isWslShell).toBe(false);
    
    // WSL shell
    const wslContext = createValidationContext('wsl', createMockShellConfig({
      wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true }
    }));
    expect(wslContext.isWindowsShell).toBe(false);
    expect(wslContext.isUnixShell).toBe(true);
    expect(wslContext.isWslShell).toBe(true);
    
    // PowerShell (Windows shell)
    const powershellContext = createValidationContext('powershell', createMockShellConfig());
    expect(powershellContext.isWindowsShell).toBe(true);
    expect(powershellContext.isUnixShell).toBe(false);
    expect(powershellContext.isWslShell).toBe(false);
  });
});
