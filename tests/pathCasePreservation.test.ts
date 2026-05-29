import { describe, test, expect } from '@jest/globals';
import { normalizeAllowedPaths, normalizeWindowsPath } from '../src/utils/validation.js';

/**
 * Unix/WSL paths must preserve their original casing through normalization.
 * On case-sensitive filesystems (Linux, WSL2 mounts),
 * "my.TypeScript" and "my.typescript" are different directories.
 */
describe('Path case preservation', () => {

  describe('normalizeAllowedPaths', () => {
    test('preserves mixed-case segments in WSL mount paths', () => {
      const input = ['/mnt/d/dev/my.TypeScript/project'];
      const result = normalizeAllowedPaths(input);
      expect(result[0]).toBe('/mnt/d/dev/my.TypeScript/project');
    });

    test('preserves mixed-case segments in /home paths', () => {
      const input = ['/home/JohnDoe/Projects/myApp'];
      const result = normalizeAllowedPaths(input);
      expect(result[0]).toBe('/home/JohnDoe/Projects/myApp');
    });

    test('preserves case for multiple Unix paths while normalizing Windows paths', () => {
      const input = [
        'C:\\Users\\Admin\\Project',
        '/mnt/d/dev/my.TypeScript/project',
        '/home/User Name/workspace',
      ];
      const result = normalizeAllowedPaths(input);

      // Windows path: case-insensitive, lowercase is fine
      expect(result[0]).toBe('c:\\users\\admin\\project');
      // Unix paths: case must be preserved
      expect(result[1]).toBe('/mnt/d/dev/my.TypeScript/project');
      expect(result[2]).toBe('/home/User Name/workspace');
    });

    test('preserves case for /tmp paths with mixed-case directories', () => {
      const input = ['/tmp/BuildOutput/x86'];
      const result = normalizeAllowedPaths(input);
      expect(result[0]).toBe('/tmp/BuildOutput/x86');
    });

    test('does not lowercase path segment that happens to look like a drive letter', () => {
      const input = ['/mnt/c/MyFolder'];
      const result = normalizeAllowedPaths(input);
      expect(result[0]).toBe('/mnt/c/MyFolder');
    });

    test('preserves case for deeply nested WSL paths', () => {
      const input = ['/mnt/d/repos/OrgName/my.TypeScript/project/src/utils'];
      const result = normalizeAllowedPaths(input);
      expect(result[0]).toBe('/mnt/d/repos/OrgName/my.TypeScript/project/src/utils');
    });
  });

  describe('normalizeWindowsPath (used inside normalizeAllowedPaths)', () => {
    test('preserves case for WSL paths (no lowercasing in this function)', () => {
      const result = normalizeWindowsPath('/mnt/d/dev/my.TypeScript/project');
      expect(result).toBe('/mnt/d/dev/my.TypeScript/project');
    });

    test('preserves case for /home paths', () => {
      const result = normalizeWindowsPath('/home/JohnDoe/Projects');
      expect(result).toBe('/home/JohnDoe/Projects');
    });
  });

  describe('dedup still works with case-preserved paths', () => {
    test('deduplicates exact duplicates while preserving case', () => {
      const input = [
        '/mnt/d/dev/my.TypeScript/project',
        '/mnt/d/dev/my.TypeScript/project', // exact duplicate
      ];
      const result = normalizeAllowedPaths(input);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('/mnt/d/dev/my.TypeScript/project');
    });

    test('does not deduplicate paths that differ only by case on Unix', () => {
      // On case-sensitive filesystems, these are different directories
      const input = [
        '/mnt/d/dev/my.TypeScript/project',
        '/mnt/d/dev/my.typescript/project',
      ];
      const result = normalizeAllowedPaths(input);
      expect(result).toHaveLength(2);
      expect(result).toContain('/mnt/d/dev/my.TypeScript/project');
      expect(result).toContain('/mnt/d/dev/my.typescript/project');
    });
  });
});
