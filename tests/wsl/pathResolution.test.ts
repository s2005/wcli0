import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { resolveWslAllowedPaths, convertWindowsToWslPath } from '../../src/utils/validation.js';
import { createValidationContext } from '../../src/utils/validationContext.js';
import type { ResolvedShellConfig } from '../../src/types/config.js';

const baseResolved: Readonly<ResolvedShellConfig> = {
  enabled: true,
  executable: { command: 'wsl.exe', args: [] },
  security: {
    maxCommandLength: 1000,
    commandTimeout: 30,
    enableInjectionProtection: true,
    restrictWorkingDirectory: true
  },
  restrictions: {
    blockedCommands: [],
    blockedArguments: [],
    blockedOperators: []
  },
  paths: { allowedPaths: [], initialDir: undefined },
  wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true }
};

describe('resolveWslAllowedPaths', () => {
  let consoleWarnSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('should use global paths when inheritGlobalPaths is true and shell allowedPaths empty', () => {
    const globalPaths = ['C:\\Users\\user', 'D:\\Data'];
    const context = createValidationContext('wsl', { ...baseResolved });
    const resolved = resolveWslAllowedPaths(globalPaths, context);
    expect(resolved).toEqual(['/mnt/c/Users/user', '/mnt/d/Data']);
  });

  it('should use only shell allowedPaths when inheritGlobalPaths is false', () => {
    const globalPaths = ['C:\\Users\\user'];
    const context = createValidationContext('wsl', {
      ...baseResolved,
      paths: { allowedPaths: ['/custom/path1', '/mnt/d/project'], initialDir: undefined },
      wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: false }
    });
    const resolved = resolveWslAllowedPaths(globalPaths, context);
    expect(resolved).toEqual(['/custom/path1', '/mnt/d/project']);
  });

  it('should merge global and shell allowedPaths when inheritGlobalPaths is true', () => {
    const globalPaths = ['C:\\Users\\user'];
    const context = createValidationContext('wsl', {
      ...baseResolved,
      paths: { allowedPaths: ['/custom/path1'], initialDir: undefined }
    });
    const resolved = resolveWslAllowedPaths(globalPaths, context);
    expect(resolved).toEqual(['/custom/path1', '/mnt/c/Users/user']);
  });

  it('should ensure uniqueness of paths after conversion and merging', () => {
    const globalPaths = ['C:\\Users\\user', 'D:\\Data'];
    const context = createValidationContext('wsl', {
      ...baseResolved,
      paths: { allowedPaths: ['/mnt/c/Users/user', '/new/path'], initialDir: undefined }
    });
    const resolved = resolveWslAllowedPaths(globalPaths, context);
    expect(resolved).toEqual(['/mnt/c/Users/user', '/new/path', '/mnt/d/Data']);
    expect(resolved.length).toBe(3);
  });

  test.skip('should skip global paths that fail conversion and log a warning', () => {
    const globalPaths = ['C:Usersuser', 'ServerSharePath', 'D:Data'];
    const context = createValidationContext('wsl', { ...baseResolved });
    const resolved = resolveWslAllowedPaths(globalPaths, context);
    expect(resolved).toEqual(['/mnt/c/Users/user', '/mnt/d/Data']);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Skipping global path "\\\\Server\\Share\\Path" for WSL: UNC paths are not supported for WSL conversion.'
    );
  });

  it('should handle empty global paths and empty shell allowedPaths', () => {
    const globalPaths: string[] = [];
    const context = createValidationContext('wsl', { ...baseResolved });
    const resolved = resolveWslAllowedPaths(globalPaths, context);
    expect(resolved).toEqual([]);
  });

  it('should handle undefined shell allowedPaths', () => {
    const globalPaths = ['C:\\Users\\user'];
    const context = createValidationContext('wsl', {
      ...baseResolved,
      paths: { allowedPaths: undefined as any, initialDir: undefined }
    });
    const resolved = resolveWslAllowedPaths(globalPaths, context);
    expect(resolved).toEqual(['/mnt/c/Users/user']);
  });

  it('should use custom mountPoint from wslConfig', () => {
    const globalPaths = ['C:\\Data'];
    const context = createValidationContext('wsl', {
      ...baseResolved,
      wslConfig: { mountPoint: '/custom/mount/', inheritGlobalPaths: true }
    });
    const resolved = resolveWslAllowedPaths(globalPaths, context);
    expect(resolved).toEqual(['/custom/mount/c/Data']);
  });

  it('should default mountPoint to /mnt/ if not provided', () => {
    const globalPaths = ['C:\\Data'];
    const context = createValidationContext('wsl', {
      ...baseResolved,
      wslConfig: { inheritGlobalPaths: true }
    });
    const resolved = resolveWslAllowedPaths(globalPaths, context);
    expect(resolved).toEqual(['/mnt/c/Data']);
  });

  it('should default inheritGlobalPaths to true when undefined', () => {
    const globalPaths = ['C:\\Users\\user'];
    const context = createValidationContext('wsl', {
      ...baseResolved,
      paths: { allowedPaths: ['/specific/wsl'], initialDir: undefined },
      wslConfig: { mountPoint: '/mnt/' }
    });
    const resolved = resolveWslAllowedPaths(globalPaths, context);
    expect(resolved).toContain('/mnt/c/Users/user');
    expect(resolved).toContain('/specific/wsl');
  });

  it('should not add converted global paths if already listed', () => {
    const globalPaths = ['C:\\Users\\user'];
    const context = createValidationContext('wsl', {
      ...baseResolved,
      paths: { allowedPaths: ['/mnt/c/Users/user'], initialDir: undefined }
    });
    const resolved = resolveWslAllowedPaths(globalPaths, context);
    expect(resolved).toEqual(['/mnt/c/Users/user']);
    expect(resolved.length).toBe(1);
  });
});
