import { BashPlugin } from '../BashImpl.js';
import { ValidationContext } from '../../base/ShellInterface.js';

describe('BashPlugin', () => {
  let plugin: BashPlugin;

  beforeEach(() => {
    plugin = new BashPlugin();
  });

  describe('configuration', () => {
    it('should have correct shell type', () => {
      expect(plugin.shellType).toBe('bash');
    });

    it('should have Bash display name', () => {
      expect(plugin.displayName).toBe('Bash');
    });

    it('should have default configuration', () => {
      expect(plugin.defaultConfig).toBeDefined();
      expect(plugin.defaultConfig.enabled).toBe(true);
      expect(plugin.defaultConfig.shellCommand).toBe('/bin/bash');
    });

    it('should use correct shell arguments', () => {
      expect(plugin.defaultConfig.shellArgs).toEqual(['-c']);
    });

    it('should allow command chaining', () => {
      expect(plugin.defaultConfig.security.allowCommandChaining).toBe(true);
    });

    it('should allow pipe operators', () => {
      expect(plugin.defaultConfig.security.allowPipeOperators).toBe(true);
    });

    it('should allow redirection', () => {
      expect(plugin.defaultConfig.security.allowRedirection).toBe(true);
    });

    it('should use Unix path style', () => {
      expect(plugin.defaultConfig.paths.pathStyle).toBe('unix');
    });

    it('should have WSL mount point configured', () => {
      expect(plugin.defaultConfig.paths.wslMountPoint).toBe('/mnt');
    });
  });

  describe('getBlockedCommands', () => {
    it('should block dangerous rm commands', () => {
      const blocked = plugin.getBlockedCommands();

      expect(blocked).toContain('rm -rf /');
      expect(blocked).toContain('rm -rf /*');
      expect(blocked).toContain('sudo rm -rf /');
    });

    it('should block disk operations', () => {
      const blocked = plugin.getBlockedCommands();

      expect(blocked).toContain('mkfs');
      expect(blocked).toContain('dd');
      expect(blocked).toContain('fdisk');
    });

    it('should block network commands', () => {
      const blocked = plugin.getBlockedCommands();

      expect(blocked).toContain('wget');
      expect(blocked).toContain('curl');
    });

    it('should return an array', () => {
      const blocked = plugin.getBlockedCommands();
      expect(Array.isArray(blocked)).toBe(true);
      expect(blocked.length).toBeGreaterThan(0);
    });
  });

  describe('validateCommand', () => {
    it('should block rm -rf /', () => {
      const context: ValidationContext = {
        shellType: 'bash',
      };

      const result = plugin.validateCommand('rm -rf /', context);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should block sudo rm -rf /', () => {
      const context: ValidationContext = {
        shellType: 'bash',
      };

      const result = plugin.validateCommand('sudo rm -rf /', context);
      expect(result.valid).toBe(false);
    });

    it('should allow safe bash commands', () => {
      const context: ValidationContext = {
        shellType: 'bash',
      };

      const safeCommands = [
        'ls -la',
        'pwd',
        'echo "hello"',
        'cat file.txt',
        'grep pattern file.txt',
        'find . -name "*.txt"',
        'mkdir test',
      ];

      safeCommands.forEach((cmd) => {
        const result = plugin.validateCommand(cmd, context);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('validatePath', () => {
    it('should accept absolute Unix paths', () => {
      const paths = [
        '/usr/local/bin',
        '/home/user',
        '/tmp/file.txt',
        '/opt/app',
        '/var/log',
      ];

      paths.forEach((path) => {
        const result = plugin.validatePath(path);
        expect(result.valid).toBe(true);
      });
    });

    it('should accept relative paths', () => {
      const paths = [
        './file.txt',
        '../parent/file.txt',
        '../../grandparent',
        './',
        '../',
      ];

      paths.forEach((path) => {
        const result = plugin.validatePath(path);
        expect(result.valid).toBe(true);
      });
    });

    it('should accept WSL mount points', () => {
      const paths = [
        '/mnt/c/Users/test',
        '/mnt/d/Projects',
        '/mnt/e/Data',
      ];

      paths.forEach((path) => {
        const result = plugin.validatePath(path);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject invalid path formats', () => {
      const paths = [
        'invalid:path',
        'no-slash',
        'http://example.com',
        'C:\\Windows\\path',
      ];

      paths.forEach((path) => {
        const result = plugin.validatePath(path);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors?.[0]).toContain('Invalid Unix path format');
      });
    });

    it('should accept root path', () => {
      const result = plugin.validatePath('/');
      expect(result.valid).toBe(true);
    });
  });
});
