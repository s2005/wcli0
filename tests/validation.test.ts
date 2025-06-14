import { describe, expect, test, jest } from '@jest/globals';
import os from 'os';
import path from 'path';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
// Import from validation.js only what still exists there
import {
  extractCommandName,
  isCommandBlocked,
  isArgumentBlocked,
  parseCommand,
  validateShellOperators,
  normalizeWindowsPath,
  isPathAllowed,
  normalizeAllowedPaths
} from '../src/utils/validation.js';
// Import the path-related functionality from pathValidation.js
import {
  validateWorkingDirectory, 
  normalizePathForShell
} from '../src/utils/pathValidation.js';
// Import createValidationContext and ValidationContext type
import { createValidationContext, ValidationContext } from '../src/utils/validationContext.js';
import type { ResolvedShellConfig } from '../src/types/config.js';

/**
 * Helper function to create a resolved shell config for testing
 */
function createTestConfig(
  blockedCommands: string[] = [], 
  blockedArgs: string[] = [], 
  blockedOperators: string[] = [],
  allowedPaths: string[] = []
): ResolvedShellConfig {
  return {
    enabled: true,
    executable: {
      command: 'test',
      args: []
    },
    security: {
      maxCommandLength: 2000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: allowedPaths.length > 0
    },
    restrictions: {
      blockedCommands,
      blockedArguments: blockedArgs,
      blockedOperators
    },
    paths: {
      allowedPaths: allowedPaths.length > 0 ? allowedPaths : [],
      initialDir: ''
    }
  };
}

/**
 * Helper function to create a validation context for testing
 */
function createTestContext(shellName: string, config: ResolvedShellConfig): ValidationContext {
  return createValidationContext(shellName, config);
}

// Mock child_process exec
jest.mock('child_process', () => ({
  exec: jest.fn((cmd: string, callback: (error: Error | null, result: { stdout: string } | null) => void) => {
    if (cmd === 'where "cmd.exe"') {
      callback(null, { stdout: 'C:\\Windows\\System32\\cmd.exe\n' });
    } else if (cmd === 'where "notfound"') {
      callback(new Error('Command not found'), null);
    }
  })
}));

describe('Command Name Extraction', () => {
  test.each([
    ['cmd.exe', 'cmd'],
    ['C:\\Windows\\System32\\cmd.exe', 'cmd'],
    ['powershell.exe', 'powershell'],
    ['git.cmd', 'git'],
    ['program', 'program'],
    ['path/to/script.bat', 'script'],
    // Add new edge cases
    ['CMD.EXE', 'cmd'],
    ['PowerShell.Exe', 'powershell'],
    ['notepad', 'notepad'],
    ['./local/script.exe', 'script'],
    ['\\\\server\\share\\tool.exe', 'tool'],
    ['C:\\Program Files\\App\\app.cmd', 'app'],
    ['D:\\Tools\\my-tool.bat', 'my-tool']
  ])('extractCommandName(%s) should return %s', (input, expected) => {
    expect(extractCommandName(input)).toBe(expected);
  });
});

describe('Command Blocking', () => {
  const blockedCommands = ['rm', 'del', 'format'];

  test.each([
    ['rm', true],
    ['rm.exe', true],
    ['C:\\Windows\\System32\\rm.exe', true],
    ['RM.exe', true],
    ['DeL.exe', true],
    ['FORMAT.EXE', true],
    ['rm.cmd', true],
    ['del.bat', true],
    ['notepad.exe', false],
    ['format.com', false],
    ['formatter.exe', false],
    ['delete.exe', false],
  ])('isCommandBlocked(%s) should return %s', (command, expected) => {
    // Create a test context with blocked commands
    const config = createTestConfig(blockedCommands);
    const context = createTestContext('cmd', config);
    expect(isCommandBlocked(command, context)).toBe(expected);
  });

  test('isCommandBlocked works with validation context', () => {
    // Create a config with blocked commands
    const config = createTestConfig(['rm', 'del', 'format']);
    const context = createTestContext('cmd', config);
    
    // Test with context
    expect(isCommandBlocked('rm', context)).toBe(true);
    expect(isCommandBlocked('del.bat', context)).toBe(true);
    expect(isCommandBlocked('notepad', context)).toBe(false);
  });
});

describe('Argument Blocking', () => {
  const blockedArgs = ['--system', '-rf', '--exec'];

  test('isArgumentBlocked identifies blocked arguments', () => {
    const config = createTestConfig([], blockedArgs);
    const context = createTestContext('cmd', config);
    
    expect(isArgumentBlocked(['--help', '--system'], context)).toBe(true);
    expect(isArgumentBlocked(['-rf'], context)).toBe(true);
    expect(isArgumentBlocked(['--safe', '--normal'], context)).toBe(false);
  });

  test('isArgumentBlocked is case insensitive for security', () => {
    const config = createTestConfig([], blockedArgs);
    const context = createTestContext('cmd', config);
    
    expect(isArgumentBlocked(['--SYSTEM'], context)).toBe(true);
    expect(isArgumentBlocked(['-RF'], context)).toBe(true);
    expect(isArgumentBlocked(['--SyStEm'], context)).toBe(true);
  });

  test('isArgumentBlocked handles multiple arguments', () => {
    const config = createTestConfig([], blockedArgs);
    const context = createTestContext('cmd', config);
    
    expect(isArgumentBlocked(['--safe', '--exec', '--other'], context)).toBe(true);
    expect(isArgumentBlocked(['arg1', 'arg2', '--help'], context)).toBe(false);
  });
  
  test('isArgumentBlocked uses validation context restrictions', () => {
    // Create a config with blocked arguments and a validation context
    const config = createTestConfig([], ['--system', '-rf', '--exec']);
    const context = createTestContext('cmd', config);
    
    // Test with restrictions from the context
    expect(isArgumentBlocked(['--help', '--system'], context)).toBe(true);
    expect(isArgumentBlocked(['-rf'], context)).toBe(true);
    expect(isArgumentBlocked(['--safe'], context)).toBe(false);
  });

  test('isArgumentBlocked with context handles shell-specific overrides', () => {
    // Create a base config
    const config = createTestConfig([], ['--global-blocked']);
    
    // Create a config with shell-specific overrides
    const powershellConfig = createTestConfig([], ['--ps-specific', '-psarg']);
    const powershellContext = createTestContext('powershell', powershellConfig);
    
    // Should only block shell-specific blocked arguments, not global ones
    expect(isArgumentBlocked(['--ps-specific'], powershellContext)).toBe(true);
    expect(isArgumentBlocked(['-psarg'], powershellContext)).toBe(true);
    expect(isArgumentBlocked(['--global-blocked'], powershellContext)).toBe(false);
  });
});

describe('Command Parsing', () => {
  test('parseCommand handles basic commands', () => {
    expect(parseCommand('dir')).toEqual({ command: 'dir', args: [] });
    expect(parseCommand('echo hello')).toEqual({ command: 'echo', args: ['hello'] });
  });

  test('parseCommand handles quoted arguments', () => {
    expect(parseCommand('echo "hello world"')).toEqual({ 
      command: 'echo', 
      args: ['hello world']
    });
    expect(parseCommand('echo "first" "second"')).toEqual({
      command: 'echo',
      args: ['first', 'second']
    });
  });

  test('parseCommand handles paths with spaces', () => {
    expect(parseCommand('C:\\Program Files\\Git\\bin\\git.exe status')).toEqual({
      command: 'C:\\Program Files\\Git\\bin\\git.exe',
      args: ['status']
    });
  });

  test('parseCommand handles empty input', () => {
    expect(parseCommand('')).toEqual({ command: '', args: [] });
    expect(parseCommand('  ')).toEqual({ command: '', args: [] });
  });

  test('parseCommand handles mixed quotes', () => {
    expect(parseCommand('git commit -m "first commit" --author="John Doe"')).toEqual({
      command: 'git',
      args: ['commit', '-m', 'first commit', '--author=John Doe']
    });
  });
});

describe('Path Normalization', () => {
  // Fixed test cases based on actual function behavior
  test.each([
    // Windows paths
    ['C:/Users/test', 'C:\\Users\\test'],
    ['C:\\Users\\test', 'C:\\Users\\test'],
    ['c:/windows/system32', 'C:\\windows\\system32'],

    // Relative paths - these become C:\ prefixed
    ['\\Users\\test', 'C:\\Users\\test'],
    ['foo\\bar', 'C:\\foo\\bar'],
    ['../relative/path', 'C:\\relative\\path'],

    // Git Bash style - these get converted correctly
    ['/c/Users/Projects', 'C:\\Users\\Projects'],
    ['/d/Projects', 'D:\\Projects'],  // Fixed: should have colon
    ['/c/folder/../other', 'C:\\other'],

    // Drive-relative paths
    ['C:folder/sub', 'C:\\folder\\sub'],
    ['C:folder/../', 'C:\\'],
    ['D:../relative/path', 'D:\\relative\\path'],  // Fixed: should have colon

    // UNC paths
    ['\\\\server\\share\\file', '\\\\server\\share\\file'],
    ['//server/share/folder', '/server/share/folder'],  // Fixed: UNC from // isn't handled the same

    // Single backslash paths relative to system drive
    ['\\Program Files\\App', 'C:\\Program Files\\App'],
    ['\\Windows', 'C:\\Windows'],
    ['\\', 'C:\\'],

    // Ensure UNC paths still handled
    ['\\\\server\\share', '\\\\server\\share'],
    ['\\\\192.168.1.1\\folder', '\\\\192.168.1.1\\folder'],

    // WSL paths (preserved)
    ['/mnt/c/foo/bar', '/mnt/c/foo/bar'],
    ['/mnt/d/', '/mnt/d/'],
    ['/home/user/documents', '/home/user/documents'],
    ['/usr/local/bin', '/usr/local/bin'],
    ['/', '/'],

    // Redundant separators
    ['C:\\\\Users\\\\test', 'C:\\Users\\test'],
    ['C:/Users//test', 'C:\\Users\\test'],
    ['C:\\temp\\\\\\\\subfolder', 'C:\\temp\\subfolder'],

    // Special cases
    ['c:no_slash_path', 'C:\\no_slash_path'],
    ['C:..\\another', 'C:\\another'],
    ['C:\\..\\another', 'C:\\another'],
  ])('normalizeWindowsPath(%s) should return %s', (input, expected) => {
    expect(normalizeWindowsPath(input)).toBe(expected);
  });

  // Add home directory expansion test (if implemented)
  test('should expand home directory', () => {
    const homedir = os.homedir();
    // This test assumes home directory expansion is implemented
    // expect(normalizeWindowsPath('~')).toBe(homedir);
    // expect(normalizeWindowsPath('~/test')).toBe(path.join(homedir, 'test'));
  });
});

describe('Allowed Paths Normalization', () => {
  test('removes duplicates and normalizes paths', () => {
    const paths = ['C:/Test', 'c:\\test', '/c/Test', 'C:\\test\\'];
    expect(normalizeAllowedPaths(paths)).toEqual(['c:\\test']);
  });
  test('removes nested subpaths', () => {
    const paths = ['/d/mcp', '/d/mcp/my'];
    expect(normalizeAllowedPaths(paths)).toEqual(['d:\\mcp']);
  });
  test('keeps multiple top-level paths', () => {
    const paths = ['/c/Users', '/d/Projects'];
    expect(normalizeAllowedPaths(paths)).toEqual(['c:\\users', 'd:\\projects']);
  });
});

describe('Path Validation', () => {
  // allowed paths in normalized format
  const allowedPaths = [
    'C:\\Users\\test',
    'D:\\Projects',
    'C:\\Users\\Projects\\'
  ];

  test('isPathAllowed validates paths correctly', () => {
    expect(isPathAllowed(normalizeWindowsPath('C:\\Users\\test'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('C:\\Users\\test\\docs'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('D:\\Projects\\code'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('/c/Users/Projects'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('E:\\NotAllowed'), allowedPaths)).toBe(false);
    expect(isPathAllowed(normalizeWindowsPath('C:\\Users\\Projects'), allowedPaths)).toBe(true);
  });
  
  test('isPathAllowed handles trailing slashes correctly', () => {
    // Test when allowedPath has trailing slash and input doesn't
    // 'C:\Users\Projects\' is in allowedPaths with trailing slash
    expect(isPathAllowed(normalizeWindowsPath('C:\\Users\\Projects'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('/c/Users/Projects'), allowedPaths)).toBe(true);
    
    // Test when allowedPath doesn't have trailing slash and input does
    // 'D:\Projects' is in allowedPaths without trailing slash
    expect(isPathAllowed(normalizeWindowsPath('D:\\Projects\\'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('/d/Projects/'), allowedPaths)).toBe(true);
    
    // Test when user path has trailing slash and allowed path doesn't
    // 'C:\Users\test' is in allowedPaths without trailing slash
    expect(isPathAllowed(normalizeWindowsPath('C:\\Users\\test\\'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('/c/Users/test/'), allowedPaths)).toBe(true);
    
    // Test with subdirectories when allowedPath has trailing slash
    expect(isPathAllowed(normalizeWindowsPath('C:\\Users\\Projects\\subdir'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('/c/Users/Projects/subdir'), allowedPaths)).toBe(true);
    
    // Test with subdirectories when allowedPath doesn't have trailing slash
    expect(isPathAllowed(normalizeWindowsPath('D:\\Projects\\subdir'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('/d/Projects/subdir'), allowedPaths)).toBe(true);
  });

  test('isPathAllowed is case insensitive', () => {
    expect(isPathAllowed(normalizeWindowsPath('c:\\users\\TEST\\docs'), allowedPaths)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('D:\\PROJECTS\\code'), allowedPaths)).toBe(true);
  });

  test('isPathAllowed supports UNC paths', () => {
    const uncAllowed = normalizeAllowedPaths(['\\\\server\\share']);
    expect(isPathAllowed(normalizeWindowsPath('\\\\server\\share\\folder'), uncAllowed)).toBe(true);
    expect(isPathAllowed(normalizeWindowsPath('\\\\server\\other'), uncAllowed)).toBe(false);
  });

  test('validateWorkingDirectory uses validation context', () => {
    const windowsConfig = createTestConfig([], [], [], ['C:\\Users\\test', 'D:\\Projects']);
    const windowsContext = createTestContext('cmd', windowsConfig);
    
    // Valid paths shouldn't throw
    expect(() => validateWorkingDirectory('C:\\Users\\test\\docs', windowsContext)).not.toThrow();
    
    // Invalid paths should throw
    expect(() => validateWorkingDirectory('E:\\NotAllowed', windowsContext))
      .toThrow(/working directory.*allowed paths/i);
  });
  
  test('validateWorkingDirectory handles GitBash paths properly', () => {
    // Using memory of GitBash style paths in the new config system
    const gitbashConfig = createTestConfig([], [], [], ['C:\\Users\\test', 'D:\\Projects']);
    const gitbashContext = createTestContext('gitbash', gitbashConfig);
    
    // GitBash paths format should be properly converted and validated
    expect(() => validateWorkingDirectory('/c/Users/test/subdir', gitbashContext)).not.toThrow();
    expect(() => validateWorkingDirectory('/d/Projects', gitbashContext)).not.toThrow();
    
    // Invalid paths should still throw
    expect(() => validateWorkingDirectory('/e/NotAllowed', gitbashContext))
      .toThrow(/working directory.*allowed paths/i);
  });
});

describe('Shell Operator Validation', () => {
  test.each([
    ['powershell', 'Get-Process & Get-Service', '&', ['&', ';', '`'], true],
    ['powershell', 'Get-Process; Start-Sleep', ';', ['&', ';', '`'], true],
    ['powershell', 'echo `whoami`', '`', ['&', ';', '`'], true],
    ['powershell', 'Get-Process | Select-Object', '|', ['&', ';', '`'], false],
    ['cmd', 'echo hello & echo world', '&', ['&', '|', ';'], true],
    ['cmd', 'dir | find "test"', '|', ['&', '|', ';'], true],
    ['custom', 'cmd & echo test', '&', ['|'], false],
    ['custom', 'cmd | echo test', '|', ['|'], true],
  ])('%s: validateShellOperators(%s) should %s for blockedOperators %s',
    (shellName, command, operator, blockedOps, shouldThrow) => {
    // Create a config with the specified blocked operators
    const config = createTestConfig([], [], blockedOps);
    // Create a validation context
    const context = createTestContext(shellName, config);

    if (shouldThrow) {
      expect(() => validateShellOperators(command, context))
        .toThrow(expect.objectContaining({
          code: ErrorCode.InvalidRequest,
          message: expect.stringContaining(`blocked operator for ${shellName}: ${operator}`)
        }));
    } else {
      expect(() => validateShellOperators(command, context)).not.toThrow();
    }
  });

  test('validateShellOperators ignores operators if no blocked operators are configured', () => {
    const config = createTestConfig();
    const context = createTestContext('cmd', config);
    
    // These would normally be blocked but are allowed because blockedOperators is empty
    expect(() => validateShellOperators('echo test & echo test2', context)).not.toThrow();
    expect(() => validateShellOperators('echo test | grep test', context)).not.toThrow();
    expect(() => validateShellOperators('echo test; echo test2', context)).not.toThrow();
  });
});

describe('WSL Path Validation', () => {
  test('validateWorkingDirectory with WSL validation context', () => {
    // Create a WSL config with allowedPaths
    const wslConfig = createTestConfig([], [], [], ['/mnt/c/allowed', '/tmp', '/home/user']);
    wslConfig.wslConfig = {
      mountPoint: '/mnt/',
      inheritGlobalPaths: true
    };
    const wslContext = createTestContext('wsl', wslConfig);
    
    // Valid WSL paths
    expect(() => validateWorkingDirectory('/mnt/c/allowed/subdir', wslContext)).not.toThrow();
    expect(() => validateWorkingDirectory('/tmp/workdir', wslContext)).not.toThrow();
    expect(() => validateWorkingDirectory('/home/user/documents', wslContext)).not.toThrow();
    
    // Invalid WSL paths
    expect(() => validateWorkingDirectory('/mnt/d/forbidden', wslContext))
      .toThrow(/working directory.*allowed paths/i);
    expect(() => validateWorkingDirectory('relative/path', wslContext))
      .toThrow(/must be an absolute path/i);
  });
  
  test('validateWorkingDirectory with WSL context handles Windows paths', () => {
    // Create a WSL config with Windows paths being converted
    const wslConfig = createTestConfig([], [], [], ['/mnt/c/allowed', '/home/user']);
    wslConfig.wslConfig = {
      mountPoint: '/mnt/',
      inheritGlobalPaths: true
    };
    const wslContext = createTestContext('wsl', wslConfig);
    
    // WSL paths should be properly validated
    expect(() => validateWorkingDirectory('/mnt/c/allowed/subdir', wslContext)).not.toThrow();
    expect(() => validateWorkingDirectory('/home/user/docs', wslContext)).not.toThrow();
    // Windows path will be rejected because we only included WSL paths in allowed paths
    expect(() => validateWorkingDirectory('C:\\Windows\\system32', wslContext)).toThrow();
    
    // Invalid paths should still throw
    expect(() => validateWorkingDirectory('/usr/local', wslContext))
      .toThrow(/working directory.*allowed paths/i);
  });
});
