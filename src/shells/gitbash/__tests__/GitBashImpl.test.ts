import { GitBashPlugin } from '../GitBashImpl.js';
import { ValidationContext } from '../../base/ShellInterface.js';

describe('GitBashPlugin', () => {
  let plugin: GitBashPlugin;

  beforeEach(() => {
    plugin = new GitBashPlugin();
  });

  describe('configuration', () => {
    it('should have correct shell type', () => {
      expect(plugin.shellType).toBe('gitbash');
    });

    it('should have Git Bash display name', () => {
      expect(plugin.displayName).toBe('Git Bash');
    });

    it('should have default configuration', () => {
      expect(plugin.defaultConfig).toBeDefined();
      expect(plugin.defaultConfig.enabled).toBe(true);
      expect(plugin.defaultConfig.shellCommand).toContain('bash.exe');
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

    it('should have rm in blocked commands', () => {
      expect(plugin.defaultConfig.restrictions.blockedCommands).toContain('rm');
    });
  });

  describe('getBlockedCommands', () => {
    it('should block dangerous rm commands', () => {
      const blocked = plugin.getBlockedCommands();

      expect(blocked).toContain('rm -rf /');
      expect(blocked).toContain('rm -rf /*');
    });

    it('should block disk formatting commands', () => {
      const blocked = plugin.getBlockedCommands();

      expect(blocked).toContain('mkfs');
      expect(blocked).toContain('dd');
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
        shellType: 'gitbash',
      };

      const result = plugin.validateCommand('rm -rf /', context);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should allow safe bash commands', () => {
      const context: ValidationContext = {
        shellType: 'gitbash',
      };

      const safeCommands = [
        'ls -la',
        'git status',
        'npm install',
        'mkdir test',
        'echo "hello"',
        'cat file.txt',
        'grep pattern file.txt',
      ];

      safeCommands.forEach((cmd) => {
        const result = plugin.validateCommand(cmd, context);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe('validatePath', () => {
    it('should accept Unix-style paths with drive letters', () => {
      const paths = [
        '/c/Users/test',
        '/d/Projects',
        '/e/Data/file.txt',
      ];

      paths.forEach((path) => {
        const result = plugin.validatePath(path);
        expect(result.valid).toBe(true);
      });
    });

    it('should accept Windows-style paths', () => {
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

    it('should accept absolute Unix paths', () => {
      const paths = [
        '/usr/local/bin',
        '/home/user',
        '/tmp/file.txt',
        '/opt/app',
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
      ];

      paths.forEach((path) => {
        const result = plugin.validatePath(path);
        expect(result.valid).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors?.[0]).toContain('Invalid Git Bash path format');
      });
    });

    it('should accept both uppercase and lowercase drive letters', () => {
      const paths = [
        '/c/test',
        '/C/test',
        'c:\\test',
        'C:\\test',
      ];

      paths.forEach((path) => {
        const result = plugin.validatePath(path);
        expect(result.valid).toBe(true);
      });
    });
  });
});
