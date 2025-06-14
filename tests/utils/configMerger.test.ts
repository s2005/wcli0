import { describe, test, expect } from '@jest/globals';
import path from 'path';
import { resolveShellConfiguration, applyWslPathInheritance } from '../../src/utils/configMerger';
import type { GlobalConfig, BaseShellConfig, WslShellConfig, ResolvedShellConfig } from '../../src/types/config';

describe('Config Merger', () => {
  const mockGlobal: GlobalConfig = {
    security: {
      maxCommandLength: 2000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true
    },
    restrictions: {
      blockedCommands: ['format'],
      blockedArguments: ['--system'],
      blockedOperators: ['&', '|']
    },
    paths: {
      allowedPaths: ['C:\\Users'],
      initialDir: 'C:\\Users\\Default'
    }
  };

  describe('resolveShellConfiguration', () => {
    test('returns global config when no overrides', () => {
      const shell: BaseShellConfig = {
        enabled: true,
        executable: { command: 'cmd.exe', args: ['/c'] }
      };

      const resolved = resolveShellConfiguration(mockGlobal, shell);
      
      expect(resolved.security).toEqual(mockGlobal.security);
      expect(resolved.restrictions).toEqual(mockGlobal.restrictions);
      expect(resolved.paths).toEqual(mockGlobal.paths);
    });

    test('merges security overrides', () => {
      const shell: BaseShellConfig = {
        enabled: true,
        executable: { command: 'cmd.exe', args: ['/c'] },
        overrides: {
          security: {
            commandTimeout: 60,
            maxCommandLength: 3000
          }
        }
      };

      const resolved = resolveShellConfiguration(mockGlobal, shell);
      
      expect(resolved.security.commandTimeout).toBe(60);
      expect(resolved.security.maxCommandLength).toBe(3000);
      expect(resolved.security.enableInjectionProtection).toBe(true); // Unchanged
    });

    test('appends blocked commands and arguments', () => {
      const shell: BaseShellConfig = {
        enabled: true,
        executable: { command: 'cmd.exe', args: ['/c'] },
        overrides: {
          restrictions: {
            blockedCommands: ['del', 'rd'],
            blockedArguments: ['--force']
          }
        }
      };

      const resolved = resolveShellConfiguration(mockGlobal, shell);
      
      expect(resolved.restrictions.blockedCommands).toContain('format');
      expect(resolved.restrictions.blockedCommands).toContain('del');
      expect(resolved.restrictions.blockedCommands).toContain('rd');
      expect(resolved.restrictions.blockedArguments).toContain('--system');
      expect(resolved.restrictions.blockedArguments).toContain('--force');
    });

    test('replaces blocked operators', () => {
      const shell: BaseShellConfig = {
        enabled: true,
        executable: { command: 'cmd.exe', args: ['/c'] },
        overrides: {
          restrictions: {
            blockedOperators: [';', '`']
          }
        }
      };

      const resolved = resolveShellConfiguration(mockGlobal, shell);
      
      expect(resolved.restrictions.blockedOperators).toEqual([';', '`']);
      expect(resolved.restrictions.blockedOperators).not.toContain('&');
      expect(resolved.restrictions.blockedOperators).not.toContain('|');
    });

    test('replaces paths config', () => {
      const shell: BaseShellConfig = {
        enabled: true,
        executable: { command: 'cmd.exe', args: ['/c'] },
        overrides: {
          paths: {
            allowedPaths: ['D:\\Projects'],
            initialDir: 'D:\\Projects'
          }
        }
      };

      const resolved = resolveShellConfiguration(mockGlobal, shell);
      
      expect(resolved.paths.allowedPaths).toEqual(['D:\\Projects']);
      expect(resolved.paths.allowedPaths).not.toContain('C:\\Users');
      expect(resolved.paths.initialDir).toBe('D:\\Projects');
    });

    test('includes WSL config for WSL shells', () => {
      const shell: WslShellConfig = {
        enabled: true,
        executable: { command: 'node', args: [path.resolve(process.cwd(), 'scripts/wsl-emulator.js'), '-e'] },
        wslConfig: {
          mountPoint: '/mnt/',
          inheritGlobalPaths: true
        }
      };

      const resolved = resolveShellConfiguration(mockGlobal, shell);
      
      expect(resolved.wslConfig).toBeDefined();
      expect(resolved.wslConfig?.mountPoint).toBe('/mnt/');
      expect(resolved.wslConfig?.inheritGlobalPaths).toBe(true);
    });
  });

  describe('applyWslPathInheritance', () => {
    test('converts and merges Windows paths for WSL', () => {
      const resolved: ResolvedShellConfig = {
        enabled: true,
        executable: { command: 'node', args: [path.resolve(process.cwd(), 'scripts/wsl-emulator.js'), '-e'] },
        security: mockGlobal.security,
        restrictions: mockGlobal.restrictions,
        paths: {
          allowedPaths: ['/home/user'],
          initialDir: '/home/user'
        },
        wslConfig: {
          mountPoint: '/mnt/',
          inheritGlobalPaths: true
        }
      };

      const globalPaths = ['C:\\Users', 'D:\\Projects'];
      const result = applyWslPathInheritance(resolved, globalPaths);

      expect(result.paths.allowedPaths).toContain('/home/user');
      expect(result.paths.allowedPaths).toContain('/mnt/c/Users');
      expect(result.paths.allowedPaths).toContain('/mnt/d/Projects');
    });

    test('does not convert paths when inheritance disabled', () => {
      const resolved: ResolvedShellConfig = {
        enabled: true,
        executable: { command: 'node', args: [path.resolve(process.cwd(), 'scripts/wsl-emulator.js'), '-e'] },
        security: mockGlobal.security,
        restrictions: mockGlobal.restrictions,
        paths: {
          allowedPaths: ['/home/user'],
          initialDir: '/home/user'
        },
        wslConfig: {
          mountPoint: '/mnt/',
          inheritGlobalPaths: false
        }
      };

      const globalPaths = ['C:\\Users', 'D:\\Projects'];
      const result = applyWslPathInheritance(resolved, globalPaths);

      expect(result.paths.allowedPaths).toEqual(['/home/user']);
      expect(result.paths.allowedPaths).not.toContain('/mnt/c/Users');
      expect(result.paths.allowedPaths).not.toContain('/mnt/d/Projects');
    });

    test('uses specified mount point', () => {
      const resolved: ResolvedShellConfig = {
        enabled: true,
        executable: { command: 'node', args: [path.resolve(process.cwd(), 'scripts/wsl-emulator.js'), '-e'] },
        security: mockGlobal.security,
        restrictions: mockGlobal.restrictions,
        paths: {
          allowedPaths: ['/home/user'],
          initialDir: '/home/user'
        },
        wslConfig: {
          mountPoint: '/windows/',
          inheritGlobalPaths: true
        }
      };

      const globalPaths = ['C:\\Users', 'D:\\Projects'];
      const result = applyWslPathInheritance(resolved, globalPaths);

      expect(result.paths.allowedPaths).toContain('/windows/c/Users');
      expect(result.paths.allowedPaths).toContain('/windows/d/Projects');
    });
  });
});
