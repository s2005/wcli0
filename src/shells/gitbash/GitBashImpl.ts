import { BaseShell } from '../base/BaseShell.js';
import { ShellConfig } from '../base/ShellInterface.js';

/**
 * Git Bash Shell Plugin
 *
 * Implements Git Bash-specific functionality.
 * Supports both Unix-style (/c/path) and Windows-style (C:\path) paths.
 */
export class GitBashPlugin extends BaseShell {
  readonly shellType = 'gitbash';
  readonly displayName = 'Git Bash';
  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: 'C:\\Program Files\\Git\\bin\\bash.exe',
    shellArgs: ['-c'],
    timeout: 30000,
    maxOutputLines: 1000,
    security: {
      allowCommandChaining: true,
      allowPipeOperators: true,
      allowRedirection: true,
      validatePaths: true,
    },
    restrictions: {
      allowedCommands: [],
      blockedCommands: ['rm'],
      allowedPaths: [],
      blockedPaths: [],
      requirePathValidation: false,
    },
    paths: {
      enforceAbsolutePaths: false,
      pathStyle: 'unix',
    },
  };

  /**
   * Get Git Bash-specific blocked commands
   */
  getBlockedCommands(): string[] {
    return [
      'rm -rf /',
      'rm -rf /*',
      'mkfs',
      'dd',
      'wget',
      'curl',
    ];
  }

  /**
   * Validate Git Bash path format
   *
   * Git Bash supports both:
   * - Unix-style: /c/Users/path
   * - Windows-style: C:\Users\path
   * - Relative: ./path or ../path
   * - Absolute Unix: /usr/local/bin
   */
  validatePath(path: string): { valid: boolean; errors?: string[] } {
    // Git Bash path formats:
    // - /c/path (Unix-style with drive letter)
    // - C:\path (Windows-style)
    // - ./path or ../path (relative)
    // - /path (absolute Unix path)
    const gitBashPathRegex = /^\/[a-z]\/|^[A-Za-z]:[/\\]|^\.\.?[/\\]?|^\//;

    if (!gitBashPathRegex.test(path)) {
      return {
        valid: false,
        errors: [`Invalid Git Bash path format: ${path}`],
      };
    }

    return { valid: true };
  }
}
