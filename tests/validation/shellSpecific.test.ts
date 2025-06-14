import { describe, test, expect } from '@jest/globals';
import { 
  validateShellOperators, 
  isCommandBlocked, 
  isArgumentBlocked 
} from '../../src/utils/validation.js';
import { createValidationContext } from '../../src/utils/validationContext.js';
import { ResolvedShellConfig } from '../../src/types/config.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Helper to create mock shell configs
function createMockShellConfig(
  shellName: string = 'cmd', 
  blockedCmds: string[] = ['rm', 'del', 'format'], 
  blockedArgs: string[] = ['--exec', '-e', '/c'],
  blockedOps: string[] = ['&', '|', ';']
): ResolvedShellConfig {
  return {
    enabled: true,
    executable: { command: 'test.exe', args: [] },
    security: {
      maxCommandLength: 1000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true
    },
    restrictions: {
      blockedCommands: blockedCmds,
      blockedArguments: blockedArgs,
      blockedOperators: blockedOps
    },
    paths: {
      allowedPaths: ['C:\\test', 'D:\\test'],
      initialDir: undefined
    }
  };
}

describe('Shell-Specific Validation', () => {
  describe('validateShellOperators', () => {
    test('blocks operators based on shell context', () => {
      // Create contexts with different blocked operators
      const cmdContext = createValidationContext('cmd', createMockShellConfig('cmd', [], [], ['&', '|']));
      const gitbashContext = createValidationContext('gitbash', createMockShellConfig('gitbash', [], [], [';', '||']));
      
      // CMD context should block & and |
      expect(() => validateShellOperators('echo hello & echo world', cmdContext))
        .toThrow(McpError);
      expect(() => validateShellOperators('echo hello | sort', cmdContext))
        .toThrow(McpError);
        
      // CMD context should allow ; (not in its blocked list)
      expect(() => validateShellOperators('echo hello; echo world', cmdContext)).not.toThrow();
        
      // GitBash context should block ; and ||
      expect(() => validateShellOperators('echo hello; echo world', gitbashContext))
        .toThrow(McpError);
      expect(() => validateShellOperators('test || echo failed', gitbashContext))
        .toThrow(McpError);
        
      // GitBash context should allow & (not in its blocked list)
      expect(() => validateShellOperators('echo hello & echo world', gitbashContext)).not.toThrow();
    });
    
    test('allows all operators if none are blocked', () => {
      const context = createValidationContext('cmd', createMockShellConfig('cmd', [], [], []));
      
      expect(() => validateShellOperators('echo hello & echo world', context)).not.toThrow();
      expect(() => validateShellOperators('echo hello | sort', context)).not.toThrow();
      expect(() => validateShellOperators('echo hello && echo world', context)).not.toThrow();
    });
  });
  
  describe('isCommandBlocked', () => {
    test('blocks commands based on shell context', () => {
      // Create contexts with different blocked commands
      const config = createMockShellConfig('cmd', ['del', 'rmdir', 'format']);
      const cmdContext = createValidationContext('cmd', config);
      
      // Simulate extractCommandName behavior by using the command name only
      // The actual implementation may handle the extraction differently
      expect(isCommandBlocked('del', cmdContext)).toBe(true);
      expect(isCommandBlocked('rmdir', cmdContext)).toBe(true);
      expect(isCommandBlocked('format', cmdContext)).toBe(true);
      
      // CMD context should allow rm (not in its blocked list)
      expect(isCommandBlocked('rm', cmdContext)).toBe(false);
      
      // Different contexts with different blocked commands
      const gitbashConfig = createMockShellConfig('gitbash', ['rm', 'rmdir', 'shutdown']);
      const gitbashContext = createValidationContext('gitbash', gitbashConfig);
      
      expect(isCommandBlocked('rm', gitbashContext)).toBe(true);
      expect(isCommandBlocked('rmdir', gitbashContext)).toBe(true);
      expect(isCommandBlocked('shutdown', gitbashContext)).toBe(true);
      
      // GitBash context should allow del (not in its blocked list)
      expect(isCommandBlocked('del', gitbashContext)).toBe(false);
    });
    
    test('normalizes command names for validation', () => {
      const cmdContext = createValidationContext('cmd', createMockShellConfig('cmd', ['del', 'notepad']));
      
      // Should block command regardless of extension or path
      expect(isCommandBlocked('del', cmdContext)).toBe(true);
      expect(isCommandBlocked('del.exe', cmdContext)).toBe(true);
      expect(isCommandBlocked('C:\\Windows\\System32\\del.exe', cmdContext)).toBe(true);
      expect(isCommandBlocked('C:\\Windows\\notepad', cmdContext)).toBe(true);
      expect(isCommandBlocked('notepad.exe', cmdContext)).toBe(true);
      expect(isCommandBlocked('/c/Windows/notepad.exe', cmdContext)).toBe(true);
    });
  });
  
  describe('isArgumentBlocked', () => {
    test('blocks arguments based on shell context', () => {
      // Create contexts with different blocked arguments
      const cmdConfig = createMockShellConfig('cmd', [], ['/c', '/k']);
      const cmdContext = createValidationContext('cmd', cmdConfig);
      
      const psConfig = createMockShellConfig('powershell', [], ['-ExecutionPolicy', '-Command']);
      const powershellContext = createValidationContext('powershell', psConfig);
      
      // Test blocked arguments in CMD context
      expect(isArgumentBlocked(['/c', 'echo test'], cmdContext)).toBe(true);
      expect(isArgumentBlocked(['/k', 'echo test'], cmdContext)).toBe(true);
      
      // CMD context should allow -ExecutionPolicy and -Command
      expect(isArgumentBlocked(['-ExecutionPolicy', 'Unrestricted'], cmdContext)).toBe(false);
      
      // PowerShell context should block -ExecutionPolicy and -Command
      expect(isArgumentBlocked(['-ExecutionPolicy', 'Unrestricted'], powershellContext)).toBe(true);
      expect(isArgumentBlocked(['-Command', 'Get-Process'], powershellContext)).toBe(true);
      
      // PowerShell context should allow /c
      expect(isArgumentBlocked(['/c', 'echo test'], powershellContext)).toBe(false);
    });
    
    test('handles simple argument patterns', () => {
      const config = createMockShellConfig('cmd', [], ['--help']);
      const context = createValidationContext('cmd', config);
      
      expect(isArgumentBlocked(['--help'], context)).toBe(true);
      
      // Should not block different arguments
      expect(isArgumentBlocked(['--helper'], context)).toBe(false);
    });
  });
});
