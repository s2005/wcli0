/**
 * Global configuration that applies to all shells by default
 */
export interface GlobalConfig {
  security: GlobalSecurityConfig;
  restrictions: GlobalRestrictionsConfig;
  paths: GlobalPathsConfig;
}

/**
 * Security configuration applied at the global level
 */
export interface GlobalSecurityConfig {
  /**
   * Maximum allowed length for command strings in characters
   */
  maxCommandLength: number;
  
  /**
   * Maximum time in seconds a command can run before timing out
   */
  commandTimeout: number;
  
  /**
   * Whether to enable protection against command injection attacks
   */
  enableInjectionProtection: boolean;
  
  /**
   * Whether to restrict commands to run only in allowed directories
   */
  restrictWorkingDirectory: boolean;
}

/**
 * Command restrictions applied at the global level
 */
export interface GlobalRestrictionsConfig {
  /**
   * List of commands that are blocked from execution
   */
  blockedCommands: string[];
  
  /**
   * List of command arguments that are blocked from execution
   */
  blockedArguments: string[];
  
  /**
   * List of shell operators that are blocked from execution
   */
  blockedOperators: string[];
}

/**
 * Path restrictions and configurations applied at the global level
 */
export interface GlobalPathsConfig {
  /**
   * List of directory paths where commands are allowed to run
   */
  allowedPaths: string[];
  
  /**
   * Initial directory to start commands in if not specified
   */
  initialDir?: string;
}

/**
 * Shell-specific overrides for global configuration
 */
export interface ShellOverrides {
  /**
   * Shell-specific security overrides
   */
  security?: Partial<GlobalSecurityConfig>;
  
  /**
   * Shell-specific restriction overrides
   */
  restrictions?: Partial<GlobalRestrictionsConfig>;
  
  /**
   * Shell-specific path overrides
   */
  paths?: Partial<GlobalPathsConfig>;
}

/**
 * Configuration for the shell executable
 */
export interface ShellExecutableConfig {
  /**
   * Command to execute the shell
   */
  command: string;
  
  /**
   * Arguments to pass to the shell command
   */
  args: string[];
}

/**
 * Base configuration for all shell types
 */
export interface BaseShellConfig {
  /**
   * Whether this shell is enabled
   */
  enabled: boolean;
  
  /**
   * Shell executable configuration
   */
  executable: ShellExecutableConfig;
  
  /**
   * Shell-specific overrides for global configuration
   */
  overrides?: ShellOverrides;
  
  /**
   * Custom path validation function for this shell
   */
  validatePath?: (dir: string) => boolean;
}

/**
 * WSL-specific configuration options
 */
export interface WslSpecificConfig {
  /**
   * Mount point for Windows drives in WSL (e.g. '/mnt/')
   */
  mountPoint?: string;
  
  /**
   * Whether to inherit global path settings and convert to WSL format
   */
  inheritGlobalPaths?: boolean;
  
  /**
   * Path mapping settings between Windows and WSL
   */
  pathMapping?: {
    /**
     * Whether path mapping is enabled
     */
    enabled: boolean;
    
    /**
     * Whether to convert Windows paths to WSL format
     */
    windowsToWsl: boolean;
  };
}

/**
 * Extended configuration for WSL shell with WSL-specific options
 */
export interface WslShellConfig extends BaseShellConfig {
  /**
   * WSL-specific configuration
   */
  wslConfig?: WslSpecificConfig;
}

/**
 * Complete server configuration
 */
export interface ServerConfig {
  /**
   * Global configuration that applies to all shells by default
   */
  global: GlobalConfig;
  
  /**
   * Configuration for specific shell types
   */
  shells: {
    powershell?: BaseShellConfig;
    cmd?: BaseShellConfig;
    gitbash?: BaseShellConfig;
    wsl?: WslShellConfig;
  };
}

/**
 * Resolved configuration after merging global and shell-specific settings
 * This is used internally and represents the final configuration for a shell
 */
export interface ResolvedShellConfig {
  /**
   * Whether this shell is enabled
   */
  enabled: boolean;
  
  /**
   * Shell executable configuration
   */
  executable: ShellExecutableConfig;
  
  /**
   * Resolved security configuration after applying overrides
   */
  security: GlobalSecurityConfig;
  
  /**
   * Resolved restrictions configuration after applying overrides
   */
  restrictions: GlobalRestrictionsConfig;
  
  /**
   * Resolved path configuration after applying overrides
   */
  paths: GlobalPathsConfig;
  
  /**
   * Custom path validation function for this shell
   */
  validatePath?: (dir: string) => boolean;
  
  /**
   * WSL-specific configuration (only present for WSL shells)
   */
  wslConfig?: WslSpecificConfig;
}