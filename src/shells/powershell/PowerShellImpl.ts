import { BaseShell } from '../base/BaseShell.js';
import { ShellConfig } from '../base/ShellInterface.js';

/**
 * PowerShell Shell Plugin
 *
 * Implements PowerShell-specific functionality for Windows environments.
 */
export class PowerShellPlugin extends BaseShell {
  readonly shellType = 'powershell';
  readonly displayName = 'PowerShell';
  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: 'powershell.exe',
    shellArgs: ['-NoProfile', '-NonInteractive', '-Command'],
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
      blockedCommands: [],
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
   * Get PowerShell-specific blocked commands
   */
  getBlockedCommands(): string[] {
    return [
      'Invoke-WebRequest',
      'Invoke-RestMethod',
      'Start-Process',
      'New-Object',
      'Invoke-Expression',
      'iex',
      'wget',
      'curl',
      'Invoke-Command',
      'Enter-PSSession',
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
