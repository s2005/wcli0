/**
 * Utility functions for working with configuration types
 */
import { BaseShellConfig, WslShellConfig } from '../types/config.js';

/**
 * Type guard to check if a shell configuration is specifically a WSL shell configuration
 * @param shell The shell configuration to check
 * @returns True if the shell is a WSL shell configuration
 */
export function isWslShellConfig(shell: BaseShellConfig | WslShellConfig | undefined): shell is WslShellConfig {
  return shell !== undefined && 'wslConfig' in shell;
}

/**
 * Type guard to check if a configuration object contains WSL-specific configuration
 * @param config The configuration object to check
 * @returns True if the configuration has WSL-specific config
 */
export function hasWslConfig(config: any): config is { wslConfig: any } {
  return config !== null && 
    typeof config === 'object' && 
    config.wslConfig !== null && 
    typeof config.wslConfig === 'object';
}
