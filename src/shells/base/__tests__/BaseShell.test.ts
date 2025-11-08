import { BaseShell } from '../BaseShell.js';
import { ValidationContext, ShellConfig } from '../ShellInterface.js';

// Concrete implementation for testing
class TestShell extends BaseShell {
  readonly shellType = 'test';
  readonly displayName = 'Test Shell';
  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: 'test',
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
      pathStyle: 'unix',
    },
  };

  getBlockedCommands(): string[] {
    return ['rm', 'del'];
  }
}

describe('BaseShell', () => {
  let shell: TestShell;

  beforeEach(() => {
    shell = new TestShell();
  });

  describe('validateCommand', () => {
    it('should validate commands against blocked list', () => {
      const context: ValidationContext = {
        shellType: 'test',
        blockedCommands: [],
      };

      const result = shell.validateCommand('rm -rf /', context);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]).toContain('rm');
    });

    it('should allow non-blocked commands', () => {
      const context: ValidationContext = {
        shellType: 'test',
      };

      const result = shell.validateCommand('ls -la', context);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should merge context blocked commands', () => {
      const context: ValidationContext = {
        shellType: 'test',
        blockedCommands: ['custom'],
      };

      const result = shell.validateCommand('custom arg', context);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should be case-insensitive for command matching', () => {
      const context: ValidationContext = {
        shellType: 'test',
      };

      const result = shell.validateCommand('RM -rf /', context);
      expect(result.valid).toBe(false);
    });

    it('should extract command name correctly', () => {
      const context: ValidationContext = {
        shellType: 'test',
      };

      const result = shell.validateCommand('  rm   -rf  /  ', context);
      expect(result.valid).toBe(false);
    });
  });

  describe('validatePath', () => {
    it('should allow all paths by default', () => {
      const context: ValidationContext = {
        shellType: 'test',
      };

      const paths = ['/test', 'C:\\test', './relative', '../parent'];
      paths.forEach(path => {
        const result = shell.validatePath(path, context);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('getBlockedCommands', () => {
    it('should return blocked commands list', () => {
      const blocked = shell.getBlockedCommands();
      expect(Array.isArray(blocked)).toBe(true);
      expect(blocked).toContain('rm');
      expect(blocked).toContain('del');
    });
  });

  describe('mergeConfig', () => {
    it('should merge configs correctly', () => {
      const base: ShellConfig = shell.defaultConfig;
      const override: Partial<ShellConfig> = {
        timeout: 60000,
      };

      const merged = shell.mergeConfig(base, override);

      expect(merged.timeout).toBe(60000);
      expect(merged.shellCommand).toBe(base.shellCommand);
    });

    it('should deep merge security config', () => {
      const base: ShellConfig = shell.defaultConfig;
      const override: Partial<ShellConfig> = {
        security: {
          allowCommandChaining: true,
        } as any,
      };

      const merged = shell.mergeConfig(base, override);

      expect(merged.security.allowCommandChaining).toBe(true);
      expect(merged.security.allowPipeOperators).toBe(false);
      expect(merged.security.validatePaths).toBe(true);
    });

    it('should deep merge restrictions config', () => {
      const base: ShellConfig = shell.defaultConfig;
      const override: Partial<ShellConfig> = {
        restrictions: {
          blockedCommands: ['wget', 'curl'],
        } as any,
      };

      const merged = shell.mergeConfig(base, override);

      expect(merged.restrictions.blockedCommands).toEqual(['wget', 'curl']);
      expect(merged.restrictions.allowedCommands).toEqual([]);
    });

    it('should deep merge paths config', () => {
      const base: ShellConfig = shell.defaultConfig;
      const override: Partial<ShellConfig> = {
        paths: {
          pathStyle: 'windows',
        } as any,
      };

      const merged = shell.mergeConfig(base, override);

      expect(merged.paths.pathStyle).toBe('windows');
      expect(merged.paths.enforceAbsolutePaths).toBe(false);
    });
  });
});
