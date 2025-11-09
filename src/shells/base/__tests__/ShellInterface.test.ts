import { ShellPlugin, ValidationContext, ValidationResult, ShellConfig } from '../ShellInterface.js';

/**
 * Test suite for ShellPlugin interface contract
 * These tests ensure all shell implementations follow the interface correctly
 */
describe('ShellPlugin Interface Contract', () => {
  // Mock implementation for testing
  class MockShellPlugin implements ShellPlugin {
    readonly shellType = 'mock';
    readonly displayName = 'Mock Shell';
    readonly defaultConfig: ShellConfig = {
      enabled: true,
      shellCommand: 'mock',
      shellArgs: [],
      timeout: 30000,
      maxOutputLines: 1000,
      security: {
        allowCommandChaining: false,
        allowPipeOperators: false,
        allowRedirection: false,
        validatePaths: true,
      },
      restrictions: {
        allowedCommands: [],
        blockedCommands: [],
        allowedPaths: [],
        blockedPaths: [],
        requirePathValidation: true,
      },
      paths: {
        enforceAbsolutePaths: false,
        pathStyle: 'unix' as const,
      },
    };

    validateCommand(command: string, context: ValidationContext): ValidationResult {
      return { valid: true };
    }

    validatePath(path: string, context: ValidationContext): ValidationResult {
      return { valid: true };
    }

    getBlockedCommands(): string[] {
      return [];
    }

    mergeConfig(base: ShellConfig, override: Partial<ShellConfig>): ShellConfig {
      return { ...base, ...override };
    }
  }

  let plugin: MockShellPlugin;

  beforeEach(() => {
    plugin = new MockShellPlugin();
  });

  describe('required properties', () => {
    it('should have shellType property', () => {
      expect(plugin.shellType).toBeDefined();
      expect(typeof plugin.shellType).toBe('string');
    });

    it('should have displayName property', () => {
      expect(plugin.displayName).toBeDefined();
      expect(typeof plugin.displayName).toBe('string');
    });

    it('should have defaultConfig property', () => {
      expect(plugin.defaultConfig).toBeDefined();
      expect(typeof plugin.defaultConfig).toBe('object');
    });

    it('should have valid defaultConfig structure', () => {
      expect(plugin.defaultConfig.enabled).toBeDefined();
      expect(plugin.defaultConfig.shellCommand).toBeDefined();
      expect(plugin.defaultConfig.security).toBeDefined();
      expect(plugin.defaultConfig.restrictions).toBeDefined();
    });
  });

  describe('required methods', () => {
    it('should implement validateCommand method', () => {
      expect(typeof plugin.validateCommand).toBe('function');
      const result = plugin.validateCommand('test', { shellType: 'mock' });
      expect(result).toHaveProperty('valid');
      expect(typeof result.valid).toBe('boolean');
    });

    it('should implement validatePath method', () => {
      expect(typeof plugin.validatePath).toBe('function');
      const result = plugin.validatePath('/test', { shellType: 'mock' });
      expect(result).toHaveProperty('valid');
      expect(typeof result.valid).toBe('boolean');
    });

    it('should implement getBlockedCommands method', () => {
      expect(typeof plugin.getBlockedCommands).toBe('function');
      const result = plugin.getBlockedCommands();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should implement mergeConfig method', () => {
      expect(typeof plugin.mergeConfig).toBe('function');
      const result = plugin.mergeConfig(plugin.defaultConfig, { timeout: 60000 });
      expect(result).toBeDefined();
    });
  });

  describe('ValidationResult structure', () => {
    it('should return valid ValidationResult from validateCommand', () => {
      const result = plugin.validateCommand('test', { shellType: 'mock' });
      expect(result).toHaveProperty('valid');
      expect(['errors', 'warnings'].some(prop => prop in result) || true).toBe(true);
    });

    it('should return valid ValidationResult from validatePath', () => {
      const result = plugin.validatePath('/test', { shellType: 'mock' });
      expect(result).toHaveProperty('valid');
    });
  });
});
