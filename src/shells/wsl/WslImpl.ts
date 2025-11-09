import { BaseShell } from '../base/BaseShell.js';
import { ShellConfig } from '../base/ShellInterface.js';

/**
 * WSL (Windows Subsystem for Linux) Shell Plugin
 *
 * Implements WSL-specific functionality.
 * Uses wsl.exe to execute commands in the default WSL distribution.
 */
export class WslPlugin extends BaseShell {
  readonly shellType = 'wsl';
  readonly displayName = 'WSL (Windows Subsystem for Linux)';
  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: 'wsl.exe',
    shellArgs: ['-e', 'bash', '-c'],
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
   * Get WSL-specific blocked commands
   */
  getBlockedCommands(): string[] {
    return [
      'rm -rf /',
      'rm -rf /*',
      'mkfs',
      'dd',
      'fdisk',
      'sudo rm -rf /',
    ];
  }

  /**
   * Validate WSL path format
   *
   * WSL paths can be:
   * - /mnt/c/path (Windows drives mounted under /mnt)
   * - /home/user/path (Linux native paths)
   * - ./path or ../path (relative paths)
   */
  validatePath(path: string): { valid: boolean; errors?: string[] } {
    // WSL path validation:
    // - /mnt/c/ (Windows drive mount)
    // - /path (Unix absolute path)
    // - ./path or ../path (relative)
    const wslPathRegex = /^\/mnt\/[a-z]\/|^\/|^\.\.?[/]/;

    if (!wslPathRegex.test(path)) {
      return {
        valid: false,
        errors: [`Invalid WSL path format: ${path}`],
      };
    }

    return { valid: true };
  }
}
