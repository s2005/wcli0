import { describe, it, expect } from '@jest/globals'; // Added expect here
import { convertWindowsToWslPath } from '../../src/utils/validation';
import { validateWorkingDirectory } from '../../src/utils/pathValidation';
import { createValidationContext } from '../../src/utils/validationContext';
import type { ResolvedShellConfig } from '../../src/types/config';

describe('convertWindowsToWslPath', () => {
  it('should convert standard Windows paths', () => {
    expect(convertWindowsToWslPath('C:\\Users\\user')).toBe('/mnt/c/Users/user');
    expect(convertWindowsToWslPath('D:\\Projects\\ProjectX')).toBe('/mnt/d/Projects/ProjectX');
  });

  it('should handle forward slashes in Windows paths', () => {
    expect(convertWindowsToWslPath('C:/Users/user')).toBe('/mnt/c/Users/user');
  });

  it('should handle mixed slashes in Windows paths', () => {
    expect(convertWindowsToWslPath('C:\\Users/user/docs')).toBe('/mnt/c/Users/user/docs');
  });

  it('should handle drive root paths', () => {
    expect(convertWindowsToWslPath('C:\\')).toBe('/mnt/c');
    expect(convertWindowsToWslPath('C:')).toBe('/mnt/c');
    expect(convertWindowsToWslPath('Z:/')).toBe('/mnt/z');
  });

  it('should handle paths with and without trailing slashes correctly', () => {
    expect(convertWindowsToWslPath('C:\\Users\\user\\')).toBe('/mnt/c/Users/user');
    expect(convertWindowsToWslPath('C:\\Users\\user')).toBe('/mnt/c/Users/user');
    expect(convertWindowsToWslPath('D:\\')).toBe('/mnt/d');
    expect(convertWindowsToWslPath('D:')).toBe('/mnt/d');
  });

  it('should use custom mount points', () => {
    expect(convertWindowsToWslPath('C:\\Data', '/custom/')).toBe('/custom/c/Data');
    expect(convertWindowsToWslPath('D:\\Folder', '/wslmnt')).toBe('/wslmnt/d/Folder'); // Test mount point without trailing slash
  });

  it('should return non-Windows paths as-is', () => {
    expect(convertWindowsToWslPath('/home/user')).toBe('/home/user');
    expect(convertWindowsToWslPath('/etc/config')).toBe('/etc/config');
    expect(convertWindowsToWslPath('relative/path')).toBe('relative/path');
    expect(convertWindowsToWslPath('./another/relative')).toBe('./another/relative');
  });

  it('should throw an error for UNC paths', () => {
    expect(() => convertWindowsToWslPath('\\\\server\\share')).toThrow('UNC paths are not supported for WSL conversion.');
    expect(() => convertWindowsToWslPath('//server/share/path')).toThrow('UNC paths are not supported for WSL conversion.');
  });

  it('should handle empty string input', () => {
    expect(convertWindowsToWslPath('')).toBe('');
  });

  it('should handle paths with spaces', () => {
    expect(convertWindowsToWslPath('C:\\Program Files\\My App')).toBe('/mnt/c/Program Files/My App');
    expect(convertWindowsToWslPath('D:/My Documents/File With Space.txt')).toBe('/mnt/d/My Documents/File With Space.txt');
  });

  it('should handle paths that are just drive letters and a slash', () => {
    expect(convertWindowsToWslPath("C:\\")).toBe("/mnt/c");
    expect(convertWindowsToWslPath("D:/")).toBe("/mnt/d");
  });

  it('should handle paths with multiple subdirectories', () => {
    expect(convertWindowsToWslPath("C:\\a\\b\\c\\d\\e")).toBe("/mnt/c/a/b/c/d/e");
  });

  it('should ensure mount point always has a trailing slash internally', () => {
    expect(convertWindowsToWslPath('C:\\Data', '/custom')).toBe('/custom/c/Data'); // No trailing slash in arg
    expect(convertWindowsToWslPath('C:\\Data', '/custom/')).toBe('/custom/c/Data'); // With trailing slash in arg
  });
});

describe('validateWslPath with Windows drives', () => {
  const baseConfig: ResolvedShellConfig = {
    enabled: true,
    executable: { command: 'wsl.exe', args: [] },
    security: {
      maxCommandLength: 1000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true
    },
    restrictions: { blockedCommands: [], blockedArguments: [], blockedOperators: [] },
    paths: { allowedPaths: ['/mnt/c/allowed'], initialDir: undefined },
    wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true }
  };

  const context = createValidationContext('wsl', baseConfig);

  it('accepts Windows drive paths when convertible', () => {
    expect(() => validateWorkingDirectory('C:\allowed', context)).not.toThrow();
    expect(() => validateWorkingDirectory('C:////allowed', context)).not.toThrow();
  });

  it('rejects Windows drive paths outside allowed paths', () => {
    expect(() => validateWorkingDirectory('D:\\not', context)).toThrow(/allowed paths/);
  });
});
