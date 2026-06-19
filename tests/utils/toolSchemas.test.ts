import { describe, test, expect } from '@jest/globals';
import { buildExecuteCommandSchema, buildValidateDirectoriesSchema } from '../../src/utils/toolSchemas.js';
import type { ResolvedShellConfig, EnvProfileConfig } from '../../src/types/config.js';

describe('Tool Schema Builders', () => {
  // Helper to create mock resolved shell configs
  const createMockConfig = (shellName: string, overrides: Partial<ResolvedShellConfig> = {}): ResolvedShellConfig => ({
    type: shellName as any,
    enabled: true,
    executable: { command: `${shellName}.exe`, args: [] },
    security: {
      maxCommandLength: 2000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true,
      ...overrides?.security
    },
    restrictions: {
      blockedCommands: [],
      blockedArguments: [],
      blockedOperators: ['&', '|'],
      ...overrides?.restrictions
    },
    paths: {
      allowedPaths: [],
      initialDir: '',
      ...overrides?.paths
    },
    ...overrides
  });
  
  describe('buildExecuteCommandSchema', () => {
    test('generates schema with all enabled shells', () => {
      const enabledShells = ['cmd', 'wsl'];
      const configs = new Map<string, ResolvedShellConfig>([
        ['cmd', createMockConfig('cmd')],
        ['wsl', createMockConfig('wsl', {
          wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true }
        })]
      ]);
      
      const schema = buildExecuteCommandSchema(enabledShells, configs);
      
      expect(schema.type).toBe('object');
      expect(schema.properties.shell.type).toBe('string');
      expect(schema.properties.shell.enum).toEqual(enabledShells);
      expect(schema.required).toContain('shell');
      expect(schema.required).toContain('command');
    });
    
    test('includes shell descriptions with settings', () => {
      const enabledShells = ['cmd', 'wsl'];
      const configs = new Map<string, ResolvedShellConfig>([
        ['cmd', createMockConfig('cmd', {
          security: { commandTimeout: 45 }
        })],
        ['wsl', createMockConfig('wsl', {
          security: { commandTimeout: 120 },
          wslConfig: { mountPoint: '/mnt/', inheritGlobalPaths: true }
        })]
      ]);
      
      const schema = buildExecuteCommandSchema(enabledShells, configs);
      
      expect(schema.properties.shell.enumDescriptions.cmd).toContain('45s');
      expect(schema.properties.shell.enumDescriptions.wsl).toContain('120s');
      expect(schema.properties.shell.enumDescriptions.cmd).toContain('Windows paths');
      expect(schema.properties.shell.enumDescriptions.wsl).toContain('Unix paths');
    });
    
    test('throws error when no shells enabled', () => {
      expect(() => {
        buildExecuteCommandSchema([], new Map());
      }).toThrow('No shells enabled');
    });

    test('omits the profile parameter when no profiles are configured', () => {
      const configs = new Map<string, ResolvedShellConfig>([['cmd', createMockConfig('cmd')]]);

      const withoutProfiles = buildExecuteCommandSchema(['cmd'], configs);
      const withEmptyProfiles = buildExecuteCommandSchema(['cmd'], configs, {});

      expect(withoutProfiles.properties.profile).toBeUndefined();
      expect(withEmptyProfiles.properties.profile).toBeUndefined();
    });

    test('exposes the profile parameter with an enum of configured names', () => {
      const configs = new Map<string, ResolvedShellConfig>([['cmd', createMockConfig('cmd')]]);
      const profiles: Record<string, EnvProfileConfig> = {
        ora11: { env: { ORACLE_HOME: 'C:/oracle/11' } },
        ora19: { env: { ORACLE_HOME: 'C:/oracle/19' } }
      };

      const schema = buildExecuteCommandSchema(['cmd'], configs, profiles);

      expect(schema.properties.profile).toBeDefined();
      expect(schema.properties.profile.type).toBe('string');
      expect(schema.properties.profile.enum).toEqual(['ora11', 'ora19']);
      expect(schema.required).not.toContain('profile');
    });
  });
  
  describe('buildValidateDirectoriesSchema', () => {
    test('includes shell parameter when shells are enabled', () => {
      const schema = buildValidateDirectoriesSchema(['cmd', 'wsl']);
      
      expect(schema.properties.directories).toBeDefined();
      expect(schema.properties.shell).toBeDefined();
      expect(schema.properties.shell.enum).toEqual(['cmd', 'wsl']);
      expect(schema.required).toContain('directories');
      expect(schema.required).not.toContain('shell');
    });
    
    test('excludes shell parameter when no shells enabled', () => {
      const schema = buildValidateDirectoriesSchema([]);
      
      expect(schema.properties.directories).toBeDefined();
      expect(schema.properties.shell).toBeUndefined();
    });
  });
});
