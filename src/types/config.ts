/**
 * Logging configuration for command output management.
 *
 * Storage Limits:
 * - maxTotalStorageSize: Controls in-memory buffer size for command outputs
 * - maxTotalLogSize: Controls on-disk log file storage when logDirectory is set
 *
 * Retention:
 * - logRetentionDays: Takes precedence when set (days-based retention)
 * - logRetentionMinutes: Used when logRetentionDays is not set (minutes-based retention)
 */
export interface LoggingConfig {
  /** Maximum number of lines to show in command output (rest is truncated) */
  maxOutputLines: number;

  /** Whether to enable output truncation */
  enableTruncation: boolean;

  /** Custom truncation message template */
  truncationMessage: string;

  /** Maximum number of logs to store */
  maxStoredLogs: number;

  /** Maximum size of a single log entry in bytes */
  maxLogSize: number;

  /**
   * Maximum total size for in-memory command output storage in bytes.
   * This limits the memory used to buffer command outputs before persistence.
   * @see maxTotalLogSize for on-disk storage limit
   */
  maxTotalStorageSize: number;

  /** Whether to enable log resource endpoints */
  enableLogResources: boolean;

  /**
   * How long to retain logs in minutes.
   * Note: logRetentionDays takes precedence when set.
   */
  logRetentionMinutes: number;

  /** How often to run cleanup in minutes */
  cleanupIntervalMinutes: number;

  /** Optional directory to persist logs to disk. When unset, logs remain in memory only. */
  logDirectory?: string;

  /**
   * Number of days to retain log files.
   * When set, this overrides logRetentionMinutes.
   */
  logRetentionDays?: number;

  /**
   * Maximum total size for on-disk log file storage in bytes.
   * Only applies when logDirectory is configured.
   * @see maxTotalStorageSize for in-memory buffer limit
   */
  maxTotalLogSize?: number;

  /** Maximum lines that get_command_output will return */
  maxReturnLines?: number;

  /** Whether to expose full log file paths in responses */
  exposeFullPath?: boolean;

  /** Maximum bytes that get_command_output will return */
  maxReturnBytes?: number;
}

/**
 * Global configuration that applies to all shells by default
 */
export interface GlobalConfig {
  security: GlobalSecurityConfig;
  restrictions: GlobalRestrictionsConfig;
  paths: GlobalPathsConfig;
  logging?: LoggingConfig;
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
 * Supported shell types
 */
export type ShellType = 'cmd' | 'powershell' | 'gitbash' | 'wsl' | 'bash';

/**
 * Base configuration for all shell types
 */
export interface BaseShellConfig {
  /**
   * The type of shell (cmd, powershell, gitbash, wsl or bash)
   */
  type: ShellType;
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
}

/**
 * Extended configuration for WSL shell with WSL-specific options
 */
export interface WslShellConfig extends BaseShellConfig {
  type: 'wsl' | 'bash';
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
    bash?: WslShellConfig;
    wsl?: WslShellConfig;
  };
}

/**
 * Resolved configuration after merging global and shell-specific settings
 * This is used internally and represents the final configuration for a shell
 */
export interface ResolvedShellConfig {
  type: ShellType;
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
