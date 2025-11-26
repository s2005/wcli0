import { jest } from '@jest/globals';
import { shellRegistry } from '../../src/core/registry.js';
import { loadShells } from '../../src/shells/loader.js';
import { getBuildConfig } from '../../src/build/shell-config.js';
import { buildExecuteCommandSchema } from '../../src/utils/toolSchemas.js';
import { setDebugLogging } from '../../src/utils/log.js';

describe('Modular Shell System Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    shellRegistry.clear();
    // Clear relevant env vars
    delete process.env.SHELL_BUILD_PRESET;
    delete process.env.INCLUDED_SHELLS;
    delete process.env.BUILD_VERBOSE;
  });

  afterEach(() => {
    process.env = originalEnv;
    shellRegistry.clear();
    setDebugLogging(false);
  });

  describe('Shell Loading Integration', () => {
    it('should load shells based on build configuration', async () => {
      process.env.SHELL_BUILD_PRESET = 'gitbash-only';

      const config = getBuildConfig();
      await loadShells({
        shells: config.includedShells,
      });

      expect(shellRegistry.getCount()).toBe(1);
      expect(shellRegistry.hasShell('gitbash')).toBe(true);
      expect(shellRegistry.hasShell('powershell')).toBe(false);
      expect(shellRegistry.hasShell('cmd')).toBe(false);
    });

    it('should load multiple shells with windows preset', async () => {
      process.env.SHELL_BUILD_PRESET = 'windows';

      const config = getBuildConfig();
      await loadShells({
        shells: config.includedShells,
      });

      expect(shellRegistry.getCount()).toBe(3);
      expect(shellRegistry.hasShell('powershell')).toBe(true);
      expect(shellRegistry.hasShell('cmd')).toBe(true);
      expect(shellRegistry.hasShell('gitbash')).toBe(true);
      expect(shellRegistry.hasShell('bash')).toBe(false);
      expect(shellRegistry.hasShell('wsl')).toBe(false);
    });

    it('should load all shells with full preset', async () => {
      process.env.SHELL_BUILD_PRESET = 'full';

      const config = getBuildConfig();
      await loadShells({
        shells: config.includedShells,
      });

      expect(shellRegistry.getCount()).toBe(5);
      expect(shellRegistry.hasShell('powershell')).toBe(true);
      expect(shellRegistry.hasShell('cmd')).toBe(true);
      expect(shellRegistry.hasShell('gitbash')).toBe(true);
      expect(shellRegistry.hasShell('bash')).toBe(true);
      expect(shellRegistry.hasShell('wsl')).toBe(true);
    });

    it('should handle custom shell list from environment', async () => {
      process.env.INCLUDED_SHELLS = 'gitbash,powershell';

      const config = getBuildConfig();
      await loadShells({
        shells: config.includedShells,
      });

      expect(shellRegistry.getCount()).toBe(2);
      expect(shellRegistry.hasShell('gitbash')).toBe(true);
      expect(shellRegistry.hasShell('powershell')).toBe(true);
      expect(shellRegistry.hasShell('cmd')).toBe(false);
    });

    it('should respect verbose flag from build config', async () => {
      process.env.SHELL_BUILD_PRESET = 'gitbash-only';
      process.env.BUILD_VERBOSE = 'true';

      setDebugLogging(true);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const config = getBuildConfig();
      expect(config.verbose).toBe(true);

      await loadShells({
        shells: config.includedShells,
        verbose: config.verbose,
      });

      expect(consoleSpy).toHaveBeenCalledWith('Loading shell: gitbash');
      expect(consoleSpy).toHaveBeenCalledWith('✓ Loaded shell: Git Bash');

      consoleSpy.mockRestore();
    });
  });

  describe('Dynamic Tool Schema Integration', () => {
    it('should generate schema with only loaded shells', async () => {
      process.env.SHELL_BUILD_PRESET = 'gitbash-only';

      const config = getBuildConfig();
      await loadShells({
        shells: config.includedShells,
      });

      const loadedShells = shellRegistry.getShellTypes();
      const schema = buildExecuteCommandSchema(loadedShells, new Map());

      expect(schema.properties.shell.enum).toEqual(['gitbash']);
    });

    it('should generate schema with multiple shells for windows preset', async () => {
      process.env.SHELL_BUILD_PRESET = 'windows';

      const config = getBuildConfig();
      await loadShells({
        shells: config.includedShells,
      });

      const loadedShells = shellRegistry.getShellTypes();
      const schema = buildExecuteCommandSchema(loadedShells, new Map());

      expect(schema.properties.shell.enum).toContain('powershell');
      expect(schema.properties.shell.enum).toContain('cmd');
      expect(schema.properties.shell.enum).toContain('gitbash');
      expect(schema.properties.shell.enum).toHaveLength(3);
    });

    it('should generate schema with all shells for full preset', async () => {
      process.env.SHELL_BUILD_PRESET = 'full';

      const config = getBuildConfig();
      await loadShells({
        shells: config.includedShells,
      });

      const loadedShells = shellRegistry.getShellTypes();
      const schema = buildExecuteCommandSchema(loadedShells, new Map());

      expect(schema.properties.shell.enum).toHaveLength(5);
      expect(schema.properties.shell.enum).toContain('powershell');
      expect(schema.properties.shell.enum).toContain('cmd');
      expect(schema.properties.shell.enum).toContain('gitbash');
      expect(schema.properties.shell.enum).toContain('bash');
      expect(schema.properties.shell.enum).toContain('wsl');
    });
  });

  describe('Registry and Configuration Integration', () => {
    it('should allow retrieving shell plugins from registry', async () => {
      process.env.SHELL_BUILD_PRESET = 'gitbash-only';

      const config = getBuildConfig();
      await loadShells({
        shells: config.includedShells,
      });

      const gitbashPlugin = shellRegistry.getShell('gitbash');
      expect(gitbashPlugin).toBeDefined();
      expect(gitbashPlugin?.shellType).toBe('gitbash');
      expect(gitbashPlugin?.displayName).toBe('Git Bash');
    });

    it('should return correct shell types from registry', async () => {
      process.env.INCLUDED_SHELLS = 'cmd,powershell';

      const config = getBuildConfig();
      await loadShells({
        shells: config.includedShells,
      });

      const types = shellRegistry.getShellTypes();
      expect(types).toContain('cmd');
      expect(types).toContain('powershell');
      expect(types).toHaveLength(2);
    });

    it('should validate commands using loaded shell plugins', async () => {
      process.env.SHELL_BUILD_PRESET = 'gitbash-only';

      const config = getBuildConfig();
      await loadShells({
        shells: config.includedShells,
      });

      const gitbashPlugin = shellRegistry.getShell('gitbash');
      expect(gitbashPlugin).toBeDefined();

      // Test valid command
      const validResult = gitbashPlugin!.validateCommand('ls -la', {
        workingDirectory: '/home/user',
      });
      expect(validResult.valid).toBe(true);

      // Test blocked command
      const blockedResult = gitbashPlugin!.validateCommand('rm -rf /', {
        workingDirectory: '/home/user',
      });
      expect(blockedResult.valid).toBe(false);
      expect(blockedResult.errors).toBeDefined();
    });
  });

  describe('Build Configuration Workflow', () => {
    it('should support complete workflow for gitbash-only build', async () => {
      // Step 1: Set preset
      process.env.SHELL_BUILD_PRESET = 'gitbash-only';

      // Step 2: Get build config
      const config = getBuildConfig();
      expect(config.buildName).toBe('gitbash-only');
      expect(config.includedShells).toEqual(['gitbash']);

      // Step 3: Load shells
      await loadShells({
        shells: config.includedShells,
      });

      // Step 4: Verify registry state
      expect(shellRegistry.getCount()).toBe(1);
      expect(shellRegistry.hasShell('gitbash')).toBe(true);

      // Step 5: Generate dynamic schema
      const loadedShells = shellRegistry.getShellTypes();
      const schema = buildExecuteCommandSchema(loadedShells, new Map());
      expect(schema.properties.shell.enum).toEqual(['gitbash']);
    });

    it('should support complete workflow for custom build', async () => {
      // Step 1: Set custom shells
      process.env.INCLUDED_SHELLS = 'powershell,cmd';

      // Step 2: Get build config
      const config = getBuildConfig();
      expect(config.buildName).toBe('custom');
      expect(config.includedShells).toEqual(['powershell', 'cmd']);

      // Step 3: Load shells
      await loadShells({
        shells: config.includedShells,
      });

      // Step 4: Verify registry state
      expect(shellRegistry.getCount()).toBe(2);
      expect(shellRegistry.hasShell('powershell')).toBe(true);
      expect(shellRegistry.hasShell('cmd')).toBe(true);

      // Step 5: Generate dynamic schema
      const loadedShells = shellRegistry.getShellTypes();
      const schema = buildExecuteCommandSchema(loadedShells, new Map());
      expect(schema.properties.shell.enum).toHaveLength(2);
      expect(schema.properties.shell.enum).toContain('powershell');
      expect(schema.properties.shell.enum).toContain('cmd');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty shell list gracefully', async () => {
      await loadShells({
        shells: [],
      });

      expect(shellRegistry.getCount()).toBe(0);
      expect(shellRegistry.getShellTypes()).toEqual([]);
    });

    it('should handle invalid shell types in custom list', async () => {
      setDebugLogging(true);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      process.env.INCLUDED_SHELLS = 'gitbash,invalid-shell';

      const config = getBuildConfig();
      await loadShells({
        shells: config.includedShells,
      });

      expect(shellRegistry.getCount()).toBe(1);
      expect(shellRegistry.hasShell('gitbash')).toBe(true);
      expect(shellRegistry.hasShell('invalid-shell')).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown shell type: invalid-shell')
      );

      consoleSpy.mockRestore();
    });

    it('should clear registry correctly', async () => {
      process.env.SHELL_BUILD_PRESET = 'full';

      const config = getBuildConfig();
      await loadShells({
        shells: config.includedShells,
      });

      expect(shellRegistry.getCount()).toBe(5);

      shellRegistry.clear();

      expect(shellRegistry.getCount()).toBe(0);
      expect(shellRegistry.getAllShells()).toEqual([]);
      expect(shellRegistry.getShellTypes()).toEqual([]);
    });

    it('should handle reloading shells after clear', async () => {
      // First load
      process.env.SHELL_BUILD_PRESET = 'gitbash-only';
      const config1 = getBuildConfig();
      await loadShells({ shells: config1.includedShells });
      expect(shellRegistry.getCount()).toBe(1);

      // Clear and reload with different preset
      shellRegistry.clear();
      process.env.SHELL_BUILD_PRESET = 'windows';
      const config2 = getBuildConfig();
      await loadShells({ shells: config2.includedShells });

      expect(shellRegistry.getCount()).toBe(3);
      expect(shellRegistry.hasShell('powershell')).toBe(true);
      expect(shellRegistry.hasShell('cmd')).toBe(true);
      expect(shellRegistry.hasShell('gitbash')).toBe(true);
    });
  });
});
