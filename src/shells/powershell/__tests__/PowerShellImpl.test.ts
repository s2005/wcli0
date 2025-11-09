import { PowerShellPlugin } from '../PowerShellImpl.js';
import { ValidationContext } from '../../base/ShellInterface.js';

describe('PowerShellPlugin', () => {
  let plugin: PowerShellPlugin;

  beforeEach(() => {
    plugin = new PowerShellPlugin();
  });

  describe('configuration', () => {
    it('should have correct shell type', () => {
      expect(plugin.shellType).toBe('powershell');
    });

    it('should have PowerShell display name', () => {
      expect(plugin.displayName).toBe('PowerShell');
    });

    it('should have default configuration', () => {
      expect(plugin.defaultConfig).toBeDefined();
      expect(plugin.defaultConfig.enabled).toBe(true);
      expect(plugin.defaultConfig.shellCommand).toBe('powershell.exe');
    });

    it('should use correct shell arguments', () => {
      expect(plugin.defaultConfig.shellArgs).toEqual([
        '-NoProfile',
        '-NonInteractive',
        '-Command',
      ]);
    });

    it('should disallow command chaining', () => {
      expect(plugin.defaultConfig.security.allowCommandChaining).toBe(false);
    });

    it('should allow pipe operators', () => {
      expect(plugin.defaultConfig.security.allowPipeOperators).toBe(true);
    });

    it('should disallow redirection', () => {
      expect(plugin.defaultConfig.security.allowRedirection).toBe(false);
    });

    it('should use Windows path style', () => {
      expect(plugin.defaultConfig.paths.pathStyle).toBe('windows');
    });
  });

  describe('getBlockedCommands', () => {
    it('should block dangerous PowerShell commands', () => {
      const blocked = plugin.getBlockedCommands();

      expect(blocked).toContain('Invoke-WebRequest');
      expect(blocked).toContain('Invoke-RestMethod');
      expect(blocked).toContain('Start-Process');
      expect(blocked).toContain('New-Object');
      expect(blocked).toContain('Invoke-Expression');
      expect(blocked).toContain('iex');
    });

    it('should block network commands', () => {
      const blocked = plugin.getBlockedCommands();

      expect(blocked).toContain('wget');
      expect(blocked).toContain('curl');
      expect(blocked).toContain('Invoke-WebRequest');
    });

    it('should block remote execution commands', () => {
      const blocked = plugin.getBlockedCommands();

      expect(blocked).toContain('Invoke-Command');
      expect(blocked).toContain('Enter-PSSession');
    });

    it('should return an array', () => {
      const blocked = plugin.getBlockedCommands();
      expect(Array.isArray(blocked)).toBe(true);
      expect(blocked.length).toBeGreaterThan(0);
    });
  });

  describe('validateCommand', () => {
    it('should block Invoke-WebRequest', () => {
      const context: ValidationContext = {
        shellType: 'powershell',
      };

      const result = plugin.validateCommand('Invoke-WebRequest http://example.com', context);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should block Invoke-Expression', () => {
      const context: ValidationContext = {
        shellType: 'powershell',
      };

      const result = plugin.validateCommand('Invoke-Expression "dangerous code"', context);
      expect(result.valid).toBe(false);
    });

    it('should allow safe PowerShell commands', () => {
      const context: ValidationContext = {
        shellType: 'powershell',
      };

      const safeCommands = [
        'Get-ChildItem',
        'Get-Process',
        'Get-Service',
        'Write-Host "Hello"',
        'Get-Content file.txt',
      ];

      safeCommands.forEach((cmd) => {
        const result = plugin.validateCommand(cmd, context);
        expect(result.valid).toBe(true);
      });
    });

    it('should be case-insensitive', () => {
      const context: ValidationContext = {
        shellType: 'powershell',
      };

      const result = plugin.validateCommand('invoke-webrequest http://example.com', context);
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
        'E:/Data/file.txt',
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
        '../',
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

    it('should accept both uppercase and lowercase drive letters', () => {
      const paths = [
        'c:\\test',
        'C:\\test',
        'd:/test',
        'D:/test',
      ];

      paths.forEach((path) => {
        const result = plugin.validatePath(path);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('mergeConfig', () => {
    it('should merge configurations correctly', () => {
      const base = plugin.defaultConfig;
      const override = {
        timeout: 60000,
      };

      const merged = plugin.mergeConfig(base, override);

      expect(merged.timeout).toBe(60000);
      expect(merged.shellCommand).toBe(base.shellCommand);
    });
  });
});
