import { BaseShell } from '../base/BaseShell.js';
import { ShellConfig } from '../base/ShellInterface.js';

/**
 * Bash Shell Plugin
 *
 * Implements Bash-specific functionality for Unix/Linux/WSL environments.
 */
export class BashPlugin extends BaseShell {
  readonly shellType = 'bash';
  readonly displayName = 'Bash';
  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: '/bin/bash',
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
      blockedCommands: [],
      allowedPaths: [],
      blockedPaths: [],
      requirePathValidation: false,
    },
    paths: {
      enforceAbsolutePaths: false,
      pathStyle: 'unix',
      wslMountPoint: '/mnt',
    },
  };

  /**
   * Get Bash-specific blocked commands
   */
  getBlockedCommands(): string[] {
    return [
      'rm -rf /',
      'rm -rf /*',
      'mkfs',
      'dd',
      'fdisk',
      'wget',
      'curl',
      'sudo rm -rf /',
    ];
  }

  /**
   * Validate Unix path format
   *
   * Supports:
   * - Absolute paths: /path/to/file
   * - Relative paths: ./path or ../path
   * - WSL mount points: /mnt/c/path
   */
  validatePath(path: string): { valid: boolean; errors?: string[] } {
    // Unix path validation: /path or ./path or ../path or /mnt/c/path
    const unixPathRegex = /^\/|^\.\.?[/]/;

    if (!unixPathRegex.test(path)) {
      return {
        valid: false,
        errors: [`Invalid Unix path format: ${path}`],
      };
    }

    return { valid: true };
  }
}
