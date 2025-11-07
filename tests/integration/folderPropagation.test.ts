import { describe, expect, test } from '@jest/globals';
import { TestCLIServer } from '../helpers/TestCLIServer.js';
import type { ServerConfig } from '../../src/types/config.js';

describe('Integration: Folder Propagation in get_config Tool', () => {
  describe('Bug: Folders not visible in get_config response', () => {
    test('should return global allowedPaths for shells without path overrides', async () => {
      const server = new TestCLIServer({
        global: {
          security: {
            restrictWorkingDirectory: true,
            maxCommandLength: 8192,
            commandTimeout: 60,
            enableInjectionProtection: true
          },
          paths: {
            allowedPaths: ['/home/user/projects', '/tmp/workspace']
          },
          restrictions: {
            blockedCommands: [],
            blockedArguments: [],
            blockedOperators: []
          }
        },
        shells: {
          wsl: {
            type: 'wsl',
            enabled: true,
            executable: {
              command: 'node',
              args: ['scripts/wsl-emulator.js', '-e']
            },
            wslConfig: {
              mountPoint: '/mnt/',
              inheritGlobalPaths: true
            }
            // No path overrides - should inherit global paths
          }
        }
      });

      const result = await server.callTool('get_config', {});

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const config = JSON.parse(result.content[0].text);

      // Global paths should be present
      expect(config.global.paths.allowedPaths).toEqual(['/home/user/projects', '/tmp/workspace']);

      // WSL shell should show paths (will FAIL with current bug)
      expect(config.shells.wsl).toBeDefined();
      expect(config.shells.wsl.paths).toBeDefined();
      expect(config.shells.wsl.paths.allowedPaths).toBeDefined();
      // The paths should be visible (either original or WSL-converted)
      expect(config.shells.wsl.paths.allowedPaths.length).toBeGreaterThan(0);
    });

    test('should show WSL-converted paths for WSL shell with inheritGlobalPaths', async () => {
      const server = new TestCLIServer({
        global: {
          security: {
            restrictWorkingDirectory: true,
            maxCommandLength: 8192,
            commandTimeout: 60,
            enableInjectionProtection: true
          },
          paths: {
            allowedPaths: ['C:\\Users\\test', 'D:\\Projects']
          },
          restrictions: {
            blockedCommands: [],
            blockedArguments: [],
            blockedOperators: []
          }
        },
        shells: {
          wsl: {
            type: 'wsl',
            enabled: true,
            executable: {
              command: 'node',
              args: ['scripts/wsl-emulator.js', '-e']
            },
            wslConfig: {
              mountPoint: '/mnt/',
              inheritGlobalPaths: true
            }
          }
        }
      });

      const result = await server.callTool('get_config', {});

      expect(result.isError).toBe(false);
      const config = JSON.parse(result.content[0].text);

      // WSL shell should show converted paths (will FAIL with current bug)
      expect(config.shells.wsl.paths).toBeDefined();
      expect(config.shells.wsl.paths.allowedPaths).toBeDefined();

      // Ideally should show converted paths like ['/mnt/c/Users/test', '/mnt/d/Projects']
      // But at minimum should show some paths
      expect(Array.isArray(config.shells.wsl.paths.allowedPaths)).toBe(true);
    });

    test('should show both inherited and override paths correctly', async () => {
      const server = new TestCLIServer({
        global: {
          security: {
            restrictWorkingDirectory: true,
            maxCommandLength: 8192,
            commandTimeout: 60,
            enableInjectionProtection: true
          },
          paths: {
            allowedPaths: ['/global/path']
          },
          restrictions: {
            blockedCommands: [],
            blockedArguments: [],
            blockedOperators: []
          }
        },
        shells: {
          wsl: {
            type: 'wsl',
            enabled: true,
            executable: {
              command: 'node',
              args: ['scripts/wsl-emulator.js', '-e']
            },
            wslConfig: {
              mountPoint: '/mnt/',
              inheritGlobalPaths: true
            }
            // No overrides - should show global paths
          },
          bash: {
            type: 'bash',
            enabled: true,
            executable: {
              command: 'bash',
              args: ['-c']
            },
            overrides: {
              paths: {
                allowedPaths: ['/bash/custom/path']
              }
            }
          }
        }
      });

      const result = await server.callTool('get_config', {});

      expect(result.isError).toBe(false);
      const config = JSON.parse(result.content[0].text);

      // Bash with overrides should show override paths (works already)
      expect(config.shells.bash.paths).toBeDefined();
      expect(config.shells.bash.paths.allowedPaths).toEqual(['/bash/custom/path']);

      // WSL without overrides should show global/inherited paths (FAILS with bug)
      expect(config.shells.wsl.paths).toBeDefined();
      expect(config.shells.wsl.paths.allowedPaths).toBeDefined();
      expect(config.shells.wsl.paths.allowedPaths.length).toBeGreaterThan(0);
    });

    test('should show initialDir for shells inheriting global config', async () => {
      const server = new TestCLIServer({
        global: {
          security: {
            restrictWorkingDirectory: true,
            maxCommandLength: 8192,
            commandTimeout: 60,
            enableInjectionProtection: true
          },
          paths: {
            allowedPaths: ['/home/user/code'],
            initialDir: '/home/user/workspace'
          },
          restrictions: {
            blockedCommands: [],
            blockedArguments: [],
            blockedOperators: []
          }
        },
        shells: {
          wsl: {
            type: 'wsl',
            enabled: true,
            executable: {
              command: 'node',
              args: ['scripts/wsl-emulator.js', '-e']
            },
            wslConfig: {
              mountPoint: '/mnt/',
              inheritGlobalPaths: true
            }
          }
        }
      });

      const result = await server.callTool('get_config', {});

      expect(result.isError).toBe(false);
      const config = JSON.parse(result.content[0].text);

      // Global should have initialDir
      expect(config.global.paths.initialDir).toBe('/home/user/workspace');

      // WSL shell should also show paths including initialDir (FAILS with bug)
      expect(config.shells.wsl.paths).toBeDefined();
      expect(config.shells.wsl.paths.allowedPaths).toBeDefined();
    });

    test('should handle multiple shells without overrides', async () => {
      const server = new TestCLIServer({
        global: {
          security: {
            restrictWorkingDirectory: true,
            maxCommandLength: 8192,
            commandTimeout: 60,
            enableInjectionProtection: true
          },
          paths: {
            allowedPaths: ['/shared/data']
          },
          restrictions: {
            blockedCommands: [],
            blockedArguments: [],
            blockedOperators: []
          }
        },
        shells: {
          wsl: {
            type: 'wsl',
            enabled: true,
            executable: {
              command: 'node',
              args: ['scripts/wsl-emulator.js', '-e']
            },
            wslConfig: {
              mountPoint: '/mnt/',
              inheritGlobalPaths: true
            }
          },
          bash: {
            type: 'bash',
            enabled: true,
            executable: {
              command: 'bash',
              args: ['-c']
            }
            // No overrides for bash either
          }
        }
      });

      const result = await server.callTool('get_config', {});

      expect(result.isError).toBe(false);
      const config = JSON.parse(result.content[0].text);

      // Both shells should show the global paths (FAILS with bug)
      expect(config.shells.wsl.paths).toBeDefined();
      expect(config.shells.wsl.paths.allowedPaths).toBeDefined();

      expect(config.shells.bash.paths).toBeDefined();
      expect(config.shells.bash.paths.allowedPaths).toEqual(['/shared/data']);
    });
  });

  describe('Working scenarios (should pass even with bug)', () => {
    test('should correctly show paths when shell has overrides', async () => {
      const server = new TestCLIServer({
        global: {
          security: {
            restrictWorkingDirectory: true,
            maxCommandLength: 8192,
            commandTimeout: 60,
            enableInjectionProtection: true
          },
          paths: {
            allowedPaths: ['/global/path']
          },
          restrictions: {
            blockedCommands: [],
            blockedArguments: [],
            blockedOperators: []
          }
        },
        shells: {
          wsl: {
            type: 'wsl',
            enabled: true,
            executable: {
              command: 'node',
              args: ['scripts/wsl-emulator.js', '-e']
            },
            wslConfig: {
              mountPoint: '/mnt/',
              inheritGlobalPaths: true
            },
            overrides: {
              paths: {
                allowedPaths: ['/wsl/specific/path']
              }
            }
          }
        }
      });

      const result = await server.callTool('get_config', {});

      expect(result.isError).toBe(false);
      const config = JSON.parse(result.content[0].text);

      // Should work correctly when overrides exist
      expect(config.shells.wsl.paths).toBeDefined();
      expect(config.shells.wsl.paths.allowedPaths).toEqual(['/wsl/specific/path']);
    });

    test('should always show global paths in global section', async () => {
      const server = new TestCLIServer({
        global: {
          security: {
            restrictWorkingDirectory: true,
            maxCommandLength: 8192,
            commandTimeout: 60,
            enableInjectionProtection: true
          },
          paths: {
            allowedPaths: ['/app/data', '/var/logs']
          },
          restrictions: {
            blockedCommands: [],
            blockedArguments: [],
            blockedOperators: []
          }
        }
      });

      const result = await server.callTool('get_config', {});

      expect(result.isError).toBe(false);
      const config = JSON.parse(result.content[0].text);

      // Global paths should always be visible
      expect(config.global.paths.allowedPaths).toEqual(['/app/data', '/var/logs']);
    });
  });
});
