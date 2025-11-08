import { BaseShell } from '../base/BaseShell.js';
import { ShellConfig } from '../base/ShellInterface.js';

/**
 * CMD (Command Prompt) Shell Plugin
 *
 * Implements CMD-specific functionality for Windows environments.
 */
export class CmdPlugin extends BaseShell {
  readonly shellType = 'cmd';
  readonly displayName = 'Command Prompt (CMD)';
  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: 'cmd.exe',
    shellArgs: ['/c'],
    timeout: 30000,
    maxOutputLines: 1000,
    security: {
      allowCommandChaining: false,
      allowPipeOperators: true,
      allowRedirection: false,
      validatePaths: true,
    },
    restrictions: {
      allowedCommands: [],
      blockedCommands: ['del', 'rd', 'rmdir'],
      allowedPaths: [],
      blockedPaths: [],
      requirePathValidation: true,
    },
    paths: {
      enforceAbsolutePaths: false,
      pathStyle: 'windows',
    },
  };

  /**
   * Get CMD-specific blocked commands
   */
  getBlockedCommands(): string[] {
    return [
      'del',
      'erase',
      'rd',
      'rmdir',
      'format',
      'diskpart',
      'reg',
      'regedit',
      'shutdown',
      'restart',
    ];
  }

  /**
   * Validate Windows path format
   */
  validatePath(path: string): { valid: boolean; errors?: string[] } {
    // Windows path validation: C:\path or \\network\path or .\relative
    const windowsPathRegex = /^[A-Za-z]:[/\\]|^\\\\|^\.\.?[/\\]?/;

    if (!windowsPathRegex.test(path)) {
      return {
        valid: false,
        errors: [`Invalid Windows path format: ${path}`],
      };
    }

    return { valid: true };
  }
}
