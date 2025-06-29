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
  const isWindowsShell = shellConfig.type === 'cmd' || shellConfig.type === 'powershell';
  const isUnixShell = shellConfig.type === 'gitbash' || shellConfig.type === 'wsl';
  const isWslShell = shellConfig.type === 'wsl';
  
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
export function getExpectedPathFormat(context: ValidationContext): 'windows' | 'unix' {
  if (context.isWindowsShell) return 'windows';
  if (context.isWslShell) return 'unix';
  return 'unix';
}
