import { jest } from '@jest/globals';
import { getBuildConfig } from '../shell-config.js';

describe('Build Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Clear relevant env vars
    delete process.env.SHELL_BUILD_PRESET;
    delete process.env.INCLUDED_SHELLS;
    delete process.env.BUILD_VERBOSE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('default configuration', () => {
    it('should return full build config by default', () => {
      const config = getBuildConfig();

      expect(config.buildName).toBe('full');
      expect(config.includeAll).toBe(true);
      expect(config.includedShells).toEqual([
        'powershell',
        'cmd',
        'gitbash',
        'bash',
        'bash_auto',
        'wsl',
      ]);
    });

    it('should not be verbose by default', () => {
      const config = getBuildConfig();
      expect(config.verbose).toBe(false);
    });
  });

  describe('preset configurations', () => {
    it('should load full preset', () => {
      process.env.SHELL_BUILD_PRESET = 'full';

      const config = getBuildConfig();

      expect(config.buildName).toBe('full');
      expect(config.includeAll).toBe(true);
      expect(config.includedShells).toEqual([
        'powershell',
        'cmd',
        'gitbash',
        'bash',
        'bash_auto',
        'wsl',
      ]);
    });

    it('should load windows preset', () => {
      process.env.SHELL_BUILD_PRESET = 'windows';

      const config = getBuildConfig();

      expect(config.buildName).toBe('windows');
      expect(config.includedShells).toEqual(['powershell', 'cmd', 'gitbash', 'bash_auto']);
    });

    it('should load unix preset', () => {
      process.env.SHELL_BUILD_PRESET = 'unix';

      const config = getBuildConfig();

      expect(config.buildName).toBe('unix');
      expect(config.includedShells).toEqual(['bash', 'bash_auto']);
    });

    it('should load gitbash-only preset', () => {
      process.env.SHELL_BUILD_PRESET = 'gitbash-only';

      const config = getBuildConfig();

      expect(config.buildName).toBe('gitbash-only');
      expect(config.includedShells).toEqual(['gitbash']);
    });

    it('should load cmd-only preset', () => {
      process.env.SHELL_BUILD_PRESET = 'cmd-only';

      const config = getBuildConfig();

      expect(config.buildName).toBe('cmd-only');
      expect(config.includedShells).toEqual(['cmd']);
    });

    it('should load powershell-only preset', () => {
      process.env.SHELL_BUILD_PRESET = 'powershell-only';

      const config = getBuildConfig();

      expect(config.buildName).toBe('powershell-only');
      expect(config.includedShells).toEqual(['powershell']);
    });

    it('should warn for unknown preset and use default', () => {
      process.env.SHELL_BUILD_PRESET = 'unknown-preset';

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

      const config = getBuildConfig();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown preset 'unknown-preset'")
      );
      expect(config.buildName).toBe('full');

      consoleSpy.mockRestore();
    });
  });

  describe('custom shell list', () => {
    it('should parse custom shell list from environment', () => {
      process.env.INCLUDED_SHELLS = 'gitbash,powershell';

      const config = getBuildConfig();

      expect(config.buildName).toBe('custom');
      expect(config.includedShells).toEqual(['gitbash', 'powershell']);
    });

    it('should handle whitespace in shell list', () => {
      process.env.INCLUDED_SHELLS = ' gitbash , powershell , cmd ';

      const config = getBuildConfig();

      expect(config.includedShells).toEqual(['gitbash', 'powershell', 'cmd']);
    });

    it('should handle single shell', () => {
      process.env.INCLUDED_SHELLS = 'gitbash';

      const config = getBuildConfig();

      expect(config.buildName).toBe('custom');
      expect(config.includedShells).toEqual(['gitbash']);
    });

    it('should support bash_auto as standalone shell option', () => {
      process.env.INCLUDED_SHELLS = 'bash_auto';

      const config = getBuildConfig();

      expect(config.buildName).toBe('custom');
      expect(config.includedShells).toEqual(['bash_auto']);
    });

    it('should handle empty strings in list', () => {
      process.env.INCLUDED_SHELLS = 'gitbash,,powershell';

      const config = getBuildConfig();

      // Empty strings after split and trim should result in empty string elements
      expect(config.includedShells).toContain('gitbash');
      expect(config.includedShells).toContain('powershell');
    });

    it('should prioritize preset over custom list', () => {
      process.env.SHELL_BUILD_PRESET = 'gitbash-only';
      process.env.INCLUDED_SHELLS = 'powershell,cmd';

      const config = getBuildConfig();

      // Preset should take precedence
      expect(config.buildName).toBe('gitbash-only');
      expect(config.includedShells).toEqual(['gitbash']);
    });
  });

  describe('verbose mode', () => {
    it('should enable verbose mode when BUILD_VERBOSE is true', () => {
      process.env.BUILD_VERBOSE = 'true';

      const config = getBuildConfig();

      expect(config.verbose).toBe(true);
    });

    it('should disable verbose mode when BUILD_VERBOSE is false', () => {
      process.env.BUILD_VERBOSE = 'false';

      const config = getBuildConfig();

      expect(config.verbose).toBe(false);
    });

    it('should disable verbose mode when BUILD_VERBOSE is not set', () => {
      const config = getBuildConfig();

      expect(config.verbose).toBe(false);
    });

    it('should respect verbose in preset configs', () => {
      process.env.SHELL_BUILD_PRESET = 'full';
      process.env.BUILD_VERBOSE = 'true';

      const config = getBuildConfig();

      expect(config.verbose).toBe(true);
    });

    it('should respect verbose in custom configs', () => {
      process.env.INCLUDED_SHELLS = 'gitbash';
      process.env.BUILD_VERBOSE = 'true';

      const config = getBuildConfig();

      expect(config.verbose).toBe(true);
    });
  });

  describe('configuration structure', () => {
    it('should have all required properties', () => {
      const config = getBuildConfig();

      expect(config).toHaveProperty('buildName');
      expect(config).toHaveProperty('includedShells');
      expect(Array.isArray(config.includedShells)).toBe(true);
    });

    it('should have valid shell names', () => {
      const validShells = ['powershell', 'cmd', 'gitbash', 'bash', 'bash_auto', 'wsl'];

      const config = getBuildConfig();

      config.includedShells.forEach((shell) => {
        expect(validShells).toContain(shell);
      });
    });
  });
});
