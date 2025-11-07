import { describe, expect, test } from '@jest/globals';
import { ServerConfig } from '../../src/types/config.js';
import { createSerializableConfig } from '../../src/utils/configUtils.js';

describe('Folder Propagation in createSerializableConfig', () => {
  describe('Bug: Folders not propagated when no path overrides exist', () => {
    test('should include global allowedPaths for shells without path overrides', () => {
      const testConfig: ServerConfig = {
        global: {
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
          paths: {
            allowedPaths: ['/home/user/projects', '/tmp']
          }
        },
        shells: {
          bash: {
            type: 'bash',
            enabled: true,
            executable: {
              command: 'bash',
              args: ['-c']
            }
            // Note: No overrides, so should inherit global paths
          }
        }
      };

      const safeConfig = createSerializableConfig(testConfig);

      // This test will FAIL with the current bug
      // Expected: bash shell should show inherited allowedPaths
      // Actual: bash shell has no paths property at all
      expect(safeConfig.shells.bash).toBeDefined();
      expect(safeConfig.shells.bash.paths).toBeDefined();
      expect(safeConfig.shells.bash.paths.allowedPaths).toEqual(['/home/user/projects', '/tmp']);
    });

    test('should include global allowedPaths for multiple shells without path overrides', () => {
      const testConfig: ServerConfig = {
        global: {
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
          paths: {
            allowedPaths: ['/var/www', '/opt/data']
          }
        },
        shells: {
          bash: {
            type: 'bash',
            enabled: true,
            executable: {
              command: 'bash',
              args: ['-c']
            }
          },
          gitbash: {
            type: 'gitbash',
            enabled: true,
            executable: {
              command: 'bash.exe',
              args: ['-c']
            }
          }
        }
      };

      const safeConfig = createSerializableConfig(testConfig);

      // Both shells should show the global paths
      expect(safeConfig.shells.bash.paths).toBeDefined();
      expect(safeConfig.shells.bash.paths.allowedPaths).toEqual(['/var/www', '/opt/data']);

      expect(safeConfig.shells.gitbash.paths).toBeDefined();
      expect(safeConfig.shells.gitbash.paths.allowedPaths).toEqual(['/var/www', '/opt/data']);
    });

    test('should prefer shell-specific paths over global paths when overrides exist', () => {
      const testConfig: ServerConfig = {
        global: {
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
          paths: {
            allowedPaths: ['/home/user/projects']
          }
        },
        shells: {
          bash: {
            type: 'bash',
            enabled: true,
            executable: {
              command: 'bash',
              args: ['-c']
            },
            overrides: {
              paths: {
                allowedPaths: ['/custom/bash/path']
              }
            }
          },
          gitbash: {
            type: 'gitbash',
            enabled: true,
            executable: {
              command: 'bash.exe',
              args: ['-c']
            }
            // No overrides - should show global paths
          }
        }
      };

      const safeConfig = createSerializableConfig(testConfig);

      // bash should show override paths
      expect(safeConfig.shells.bash.paths).toBeDefined();
      expect(safeConfig.shells.bash.paths.allowedPaths).toEqual(['/custom/bash/path']);

      // gitbash should show global paths (this will FAIL with current bug)
      expect(safeConfig.shells.gitbash.paths).toBeDefined();
      expect(safeConfig.shells.gitbash.paths.allowedPaths).toEqual(['/home/user/projects']);
    });

    test('should handle shells with WSL config and no path overrides', () => {
      const testConfig: ServerConfig = {
        global: {
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
          paths: {
            allowedPaths: ['C:\\Users', 'D:\\Projects']
          }
        },
        shells: {
          wsl: {
            type: 'wsl',
            enabled: true,
            executable: {
              command: 'wsl',
              args: ['-e']
            },
            wslConfig: {
              mountPoint: '/mnt/',
              inheritGlobalPaths: true
            }
            // No path overrides - but has wslConfig
            // Should still show global paths (converted in resolved config)
          }
        }
      };

      const safeConfig = createSerializableConfig(testConfig);

      // WSL shell should show the Windows paths (not converted yet in this function)
      // But it should at least show the global paths
      expect(safeConfig.shells.wsl).toBeDefined();
      expect(safeConfig.shells.wsl.wslConfig).toBeDefined();
      expect(safeConfig.shells.wsl.wslConfig.inheritGlobalPaths).toBe(true);

      // This will FAIL with current bug - no paths shown
      expect(safeConfig.shells.wsl.paths).toBeDefined();
      expect(safeConfig.shells.wsl.paths.allowedPaths).toEqual(['C:\\Users', 'D:\\Projects']);
    });

    test('should include initialDir from global config when shell has no path overrides', () => {
      const testConfig: ServerConfig = {
        global: {
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
          paths: {
            allowedPaths: ['/home/user/projects'],
            initialDir: '/home/user/workspace'
          }
        },
        shells: {
          bash: {
            type: 'bash',
            enabled: true,
            executable: {
              command: 'bash',
              args: ['-c']
            }
          }
        }
      };

      const safeConfig = createSerializableConfig(testConfig);

      // This will FAIL with current bug
      expect(safeConfig.shells.bash.paths).toBeDefined();
      expect(safeConfig.shells.bash.paths.allowedPaths).toEqual(['/home/user/projects']);
      expect(safeConfig.shells.bash.paths.initialDir).toBe('/home/user/workspace');
    });

    test('should handle empty global allowedPaths correctly', () => {
      const testConfig: ServerConfig = {
        global: {
          security: {
            maxCommandLength: 1000,
            commandTimeout: 30,
            enableInjectionProtection: true,
            restrictWorkingDirectory: false
          },
          restrictions: {
            blockedCommands: [],
            blockedArguments: [],
            blockedOperators: []
          },
          paths: {
            allowedPaths: []
          }
        },
        shells: {
          bash: {
            type: 'bash',
            enabled: true,
            executable: {
              command: 'bash',
              args: ['-c']
            }
          }
        }
      };

      const safeConfig = createSerializableConfig(testConfig);

      // Should still include paths property even if empty
      expect(safeConfig.shells.bash.paths).toBeDefined();
      expect(safeConfig.shells.bash.paths.allowedPaths).toEqual([]);
    });
  });

  describe('Working scenarios (should pass even with bug)', () => {
    test('should correctly serialize shell with path overrides', () => {
      const testConfig: ServerConfig = {
        global: {
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
          paths: {
            allowedPaths: ['/global/path']
          }
        },
        shells: {
          bash: {
            type: 'bash',
            enabled: true,
            executable: {
              command: 'bash',
              args: ['-c']
            },
            overrides: {
              paths: {
                allowedPaths: ['/shell/specific/path']
              }
            }
          }
        }
      };

      const safeConfig = createSerializableConfig(testConfig);

      // This should work correctly even with the bug
      expect(safeConfig.shells.bash.paths).toBeDefined();
      expect(safeConfig.shells.bash.paths.allowedPaths).toEqual(['/shell/specific/path']);
    });

    test('should include global paths in global section', () => {
      const testConfig: ServerConfig = {
        global: {
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
          paths: {
            allowedPaths: ['/home/user/data', '/var/lib']
          }
        },
        shells: {}
      };

      const safeConfig = createSerializableConfig(testConfig);

      // Global paths should always be present in global section
      expect(safeConfig.global.paths).toBeDefined();
      expect(safeConfig.global.paths.allowedPaths).toEqual(['/home/user/data', '/var/lib']);
    });
  });
});
