import type { ResolvedShellConfig } from '../types/config.js';

/**
 * Validation context that includes resolved shell configuration
 */
export interface ValidationContext {
  shellName: string;
  shellConfig: ResolvedShellConfig;
  isWindowsShell: boolean;
  isUnixShell: boolean;
  isWslShell: boolean;
}

/**
 * Create validation context from resolved shell config
 */
export function createValidationContext(
  shellName: string,
  shellConfig: ResolvedShellConfig
): ValidationContext {
  const isWindowsShell = ['cmd', 'powershell'].includes(shellName);
  const isUnixShell = ['gitbash', 'wsl'].includes(shellName);
  const isWslShell = shellName === 'wsl';
  
  return {
    shellName,
    shellConfig,
    isWindowsShell,
    isUnixShell,
    isWslShell
  };
}

/**
 * Determine expected path format for shell
 */
export function getExpectedPathFormat(context: ValidationContext): 'windows' | 'unix' | 'mixed' {
  if (context.isWindowsShell) return 'windows';
  if (context.isWslShell) return 'unix';
  if (context.shellName === 'gitbash') return 'mixed'; // Git Bash accepts both
  return 'unix';
}
