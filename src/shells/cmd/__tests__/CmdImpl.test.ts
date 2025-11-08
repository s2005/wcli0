import { CmdPlugin } from '../CmdImpl.js';
import { ValidationContext } from '../../base/ShellInterface.js';

describe('CmdPlugin', () => {
  let plugin: CmdPlugin;

  beforeEach(() => {
    plugin = new CmdPlugin();
  });

  describe('configuration', () => {
    it('should have correct shell type', () => {
      expect(plugin.shellType).toBe('cmd');
    });

    it('should have CMD display name', () => {
      expect(plugin.displayName).toBe('Command Prompt (CMD)');
    });

    it('should have default configuration', () => {
      expect(plugin.defaultConfig).toBeDefined();
      expect(plugin.defaultConfig.enabled).toBe(true);
      expect(plugin.defaultConfig.shellCommand).toBe('cmd.exe');
    });

    it('should use correct shell arguments', () => {
      expect(plugin.defaultConfig.shellArgs).toEqual(['/c']);
    });

    it('should have CMD-specific blocked commands in restrictions', () => {
      expect(plugin.defaultConfig.restrictions.blockedCommands).toContain('del');
      expect(plugin.defaultConfig.restrictions.blockedCommands).toContain('rd');
      expect(plugin.defaultConfig.restrictions.blockedCommands).toContain('rmdir');
    });

    it('should use Windows path style', () => {
      expect(plugin.defaultConfig.paths.pathStyle).toBe('windows');
    });
  });

  describe('getBlockedCommands', () => {
    it('should block file deletion commands', () => {
      const blocked = plugin.getBlockedCommands();

      expect(blocked).toContain('del');
      expect(blocked).toContain('erase');
      expect(blocked).toContain('rd');
      expect(blocked).toContain('rmdir');
    });

    it('should block system modification commands', () => {
      const blocked = plugin.getBlockedCommands();

      expect(blocked).toContain('format');
      expect(blocked).toContain('diskpart');
      expect(blocked).toContain('reg');
      expect(blocked).toContain('regedit');
    });

    it('should block shutdown commands', () => {
      const blocked = plugin.getBlockedCommands();

      expect(blocked).toContain('shutdown');
      expect(blocked).toContain('restart');
    });

    it('should return an array', () => {
      const blocked = plugin.getBlockedCommands();
      expect(Array.isArray(blocked)).toBe(true);
      expect(blocked.length).toBeGreaterThan(0);
    });
  });

  describe('validateCommand', () => {
    it('should block del command', () => {
      const context: ValidationContext = {
        shellType: 'cmd',
      };

      const result = plugin.validateCommand('del file.txt', context);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should block rmdir command', () => {
      const context: ValidationContext = {
        shellType: 'cmd',
      };

      const result = plugin.validateCommand('rmdir /s /q folder', context);
      expect(result.valid).toBe(false);
    });

    it('should allow safe CMD commands', () => {
      const context: ValidationContext = {
        shellType: 'cmd',
      };

      const safeCommands = [
        'dir',
        'cd',
        'echo Hello',
        'type file.txt',
        'mkdir newfolder',
      ];

      safeCommands.forEach((cmd) => {
        const result = plugin.validateCommand(cmd, context);
        expect(result.valid).toBe(true);
      });
    });

    it('should be case-insensitive', () => {
      const context: ValidationContext = {
        shellType: 'cmd',
      };

      const result = plugin.validateCommand('DEL file.txt', context);
      expect(result.valid).toBe(false);
    });
  });

  describe('validatePath', () => {
    it('should accept Windows absolute paths with drive letter', () => {
      const paths = [
        'C:\\Users\\test',
        'D:\\Projects',
        'E:\\Data\\file.txt',
      ];

      paths.forEach((path) => {
        const result = plugin.validatePath(path);
        expect(result.valid).toBe(true);
      });
    });

    it('should accept Windows paths with forward slashes', () => {
      const paths = [
        'C:/Users/test',
        'D:/Projects',
      ];

      paths.forEach((path) => {
        const result = plugin.validatePath(path);
        expect(result.valid).toBe(true);
      });
    });

    it('should accept relative paths', () => {
      const paths = [
        '.\\file.txt',
        '..\\parent',
        './',
      ];

      paths.forEach((path) => {
        const result = plugin.validatePath(path);
        expect(result.valid).toBe(true);
      });
    });

    it('should accept UNC paths', () => {
      const paths = [
        '\\\\server\\share',
        '\\\\network\\path\\file.txt',
      ];

      paths.forEach((path) => {
        const result = plugin.validatePath(path);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject invalid path formats', () => {
      const paths = [
        'invalid:path',
        'no-drive-letter',
        'http://example.com',
        '/unix/style/path',
      ];

      paths.forEach((path) => {
        const result = plugin.validatePath(path);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors?.[0]).toContain('Invalid Windows path format');
      });
    });
  });
});
