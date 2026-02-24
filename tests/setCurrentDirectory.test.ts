import { describe, test, expect, jest } from '@jest/globals';
import { CLIServer } from '../src/index.js';
import { buildTestConfig } from './helpers/testUtils.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

describe('set_current_directory tool - Comprehensive Tests', () => {
  const ALLOWED_DIR = 'C:\\allowed';
  const ALLOWED_DIR_2 = 'D:\\allowed2';
  const NOT_ALLOWED_DIR = 'C:\\not-allowed';

  describe('Path validation scenarios', () => {
    test('should allow exact match of allowed path', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: ALLOWED_DIR }
      }) as CallToolResult;

      expect(result.isError).toBe(false);
      expect(chdirSpy).toHaveBeenCalledWith(ALLOWED_DIR);
      expect((server as any).serverActiveCwd).toBe(ALLOWED_DIR);

      chdirSpy.mockRestore();
    });

    test('should allow subdirectory of allowed path', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR] }
        }
      });

      const server = new CLIServer(config);
      const subPath = 'C:\\allowed\\sub\\deep';
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: subPath }
      }) as CallToolResult;

      expect(result.isError).toBe(false);
      expect(chdirSpy).toHaveBeenCalledWith(subPath);
      expect((server as any).serverActiveCwd).toBe(subPath);

      chdirSpy.mockRestore();
    });

    test('should reject path not in allowed paths', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: NOT_ALLOWED_DIR }
      }) as CallToolResult;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must be within allowed paths');
      expect(chdirSpy).not.toHaveBeenCalled();

      chdirSpy.mockRestore();
    });

    test('should reject path with similar prefix but not allowed', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: 'C:\\allowedExtra' }
      }) as CallToolResult;

      expect(result.isError).toBe(true);
      expect(chdirSpy).not.toHaveBeenCalled();

      chdirSpy.mockRestore();
    });

    test('should allow path from multiple allowed paths', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR, ALLOWED_DIR_2] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: ALLOWED_DIR_2 }
      }) as CallToolResult;

      expect(result.isError).toBe(false);
      expect(chdirSpy).toHaveBeenCalledWith(ALLOWED_DIR_2);
      expect((server as any).serverActiveCwd).toBe(ALLOWED_DIR_2);

      chdirSpy.mockRestore();
    });

    test('should handle path with trailing slash', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: ALLOWED_DIR + '\\' }
      }) as CallToolResult;

      expect(result.isError).toBe(false);
      expect((server as any).serverActiveCwd).toBe(ALLOWED_DIR);

      chdirSpy.mockRestore();
    });

    test('should be case insensitive for Windows paths', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: 'c:\\ALLOWED\\sub' }
      }) as CallToolResult;

      expect(result.isError).toBe(false);

      chdirSpy.mockRestore();
    });
  });

  describe('restrictWorkingDirectory = false scenarios', () => {
    test('should allow any path when restrictWorkingDirectory is false', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: false },
          paths: { allowedPaths: [ALLOWED_DIR] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: NOT_ALLOWED_DIR }
      }) as CallToolResult;

      // When restrictWorkingDirectory is false, validation is skipped
      expect(result.isError).toBe(false);
      expect(chdirSpy).toHaveBeenCalledWith(NOT_ALLOWED_DIR);
      expect((server as any).serverActiveCwd).toBe(NOT_ALLOWED_DIR);

      chdirSpy.mockRestore();
    });

    test('should allow any path when restrictWorkingDirectory is false even with empty allowedPaths', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: false },
          paths: { allowedPaths: [] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: 'C:\\any\\path' }
      }) as CallToolResult;

      expect(result.isError).toBe(false);
      expect(chdirSpy).toHaveBeenCalledWith('C:\\any\\path');

      chdirSpy.mockRestore();
    });
  });

  describe('Empty allowedPaths scenarios', () => {
    test('should reject any path when restrictWorkingDirectory is true with empty allowedPaths', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: ALLOWED_DIR }
      }) as CallToolResult;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must be within allowed paths');
      expect(chdirSpy).not.toHaveBeenCalled();

      chdirSpy.mockRestore();
    });
  });

  describe('process.chdir() failure scenarios', () => {
    test('should not update serverActiveCwd when chdir fails', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR] }
        }
      });

      const server = new CLIServer(config);
      const originalCwd = 'C:\\original';
      (server as any).serverActiveCwd = originalCwd;

      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: ALLOWED_DIR }
      }) as CallToolResult;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to change directory');
      // serverActiveCwd should NOT be updated to the failed path
      expect((server as any).serverActiveCwd).toBe(originalCwd);

      chdirSpy.mockRestore();
    });

    test('should handle permission denied error', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: ALLOWED_DIR }
      }) as CallToolResult;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to change directory');
      expect(result.content[0].text).toContain('permission denied');

      chdirSpy.mockRestore();
    });
  });

  describe('Path normalization scenarios', () => {
    test('should handle Git Bash style paths', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: ['C:\\allowed'] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: '/c/allowed/sub' }
      }) as CallToolResult;

      expect(result.isError).toBe(false);
      expect(chdirSpy).toHaveBeenCalledWith('C:\\allowed\\sub');

      chdirSpy.mockRestore();
    });

    test('should reject Git Bash path not in allowed paths', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: ['C:\\allowed'] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: '/d/not-allowed' }
      }) as CallToolResult;

      expect(result.isError).toBe(true);
      expect(chdirSpy).not.toHaveBeenCalled();

      chdirSpy.mockRestore();
    });

    test('should handle WSL paths', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: ['/mnt/c/allowed'] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: '/mnt/c/allowed/sub' }
      }) as CallToolResult;

      expect(result.isError).toBe(false);

      chdirSpy.mockRestore();
    });

    test('should handle forward slashes in Windows paths', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR] }
        }
      });

      const server = new CLIServer(config);
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: 'C:/allowed/sub' }
      }) as CallToolResult;

      expect(result.isError).toBe(false);

      chdirSpy.mockRestore();
    });
  });

  describe('State management scenarios', () => {
    test('should update serverActiveCwd on successful change', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR] }
        }
      });

      const server = new CLIServer(config);
      (server as any).serverActiveCwd = 'C:\\old';

      await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: ALLOWED_DIR }
      });

      expect((server as any).serverActiveCwd).toBe(ALLOWED_DIR);

      chdirSpy.mockRestore();
    });

    test('should handle sequential directory changes', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR, ALLOWED_DIR_2] }
        }
      });

      const server = new CLIServer(config);

      // First change
      let result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: ALLOWED_DIR }
      }) as CallToolResult;
      expect(result.isError).toBe(false);
      expect((server as any).serverActiveCwd).toBe(ALLOWED_DIR);

      // Second change
      result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: ALLOWED_DIR_2 }
      }) as CallToolResult;
      expect(result.isError).toBe(false);
      expect((server as any).serverActiveCwd).toBe(ALLOWED_DIR_2);

      expect(chdirSpy).toHaveBeenCalledTimes(2);

      chdirSpy.mockRestore();
    });
  });

  describe('Metadata and response structure', () => {
    test('should include previous and new directory in metadata on success', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR] }
        }
      });

      const server = new CLIServer(config);
      const originalDir = 'C:\\original\\dir';
      (server as any).serverActiveCwd = originalDir;

      const requestedPath = 'C:\\allowed\\sub';
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: requestedPath }
      }) as CallToolResult;

      expect(result.isError).toBe(false);
      expect(result.metadata).toBeDefined();
      // previousDirectory should be the ACTUAL previous directory
      expect(result.metadata?.previousDirectory).toBe(originalDir);
      expect(result.metadata?.newDirectory).toBe(requestedPath);

      chdirSpy.mockRestore();
    });

    test('should include requested directory in metadata on failure', async () => {
      const chdirSpy = jest.spyOn(process, 'chdir').mockImplementation(() => {});

      const config = buildTestConfig({
        global: {
          security: { restrictWorkingDirectory: true },
          paths: { allowedPaths: [ALLOWED_DIR] }
        }
      });

      const server = new CLIServer(config);
      const requestedPath = NOT_ALLOWED_DIR;
      const result = await server._executeTool({
        name: 'set_current_directory',
        arguments: { path: requestedPath }
      }) as CallToolResult;

      expect(result.isError).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.requestedDirectory).toBe(requestedPath);

      chdirSpy.mockRestore();
    });
  });
});
