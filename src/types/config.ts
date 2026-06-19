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
 * A named environment profile that can be selected per call on execute_command.
 * The profile's `env` map is interpolated and merged into the spawned child
 * process environment, allowing the same CLI tool to run under different
 * environment variable sets (for example a per-version `PATH`).
 */
export interface EnvProfileConfig {
  /**
   * Optional human-readable description surfaced in the tool description.
   */
  description?: string;

  /**
   * Optional list of shells this profile may be used with. When set, selecting
   * the profile for any other shell is rejected. When omitted, the profile is
   * allowed for every shell.
   */
  allowedShells?: ShellType[];

  /**
   * Environment variables applied when this profile is selected. Values support
   * `${VAR}` interpolation resolved against the server's `process.env`.
   */
  env: Record<string, string>;
}

/**
 * Transport protocol configuration for the MCP server.
 * Controls how clients connect to the server (stdio or HTTP/SSE).
 */
export interface TransportConfig {
  /**
   * Transport the server uses to talk to clients.
   * - `stdio`: default, communicates over stdin/stdout.
   * - `sse`: legacy HTTP+SSE transport (protocol revision 2024-11-05), two
   *   endpoints (`GET /sse`, `POST /messages`).
   * - `http`: modern Streamable HTTP transport (protocol revision 2025-03-26),
   *   a single `/mcp` endpoint. Deprecates `sse` per the MCP spec.
   */
  mode: 'stdio' | 'sse' | 'http';
  sseHost: string;
  ssePort: number;
  /**
   * Browser origins permitted to use the SSE transport in addition to loopback
   * hosts and the configured `sseHost`. Each entry is an origin URL
   * (`https://app.example.com`) or a bare host (`192.168.1.10`); only the host
   * component is compared, case-insensitively. Required to admit browser
   * clients when binding to a wildcard address (`0.0.0.0` / `::`), where the
   * bind host is not a usable origin, and for reverse-proxy deployments whose
   * public hostname differs from the bind host. Defaults to an empty list.
   */
  sseAllowedOrigins?: string[];
  /**
   * Host the Streamable HTTP transport binds to (only used in `http` mode).
   * Defaults to `127.0.0.1` (loopback). Set to `0.0.0.0` to accept connections
   * from other hosts; pair that with `httpAllowedOrigins` for browser clients.
   */
  httpHost?: string;
  /**
   * Port the Streamable HTTP transport binds to (only used in `http` mode).
   * Must be an integer in `1..65535`. Defaults to `9444`.
   */
  httpPort?: number;
  /**
   * Browser origins permitted to use the Streamable HTTP transport in addition
   * to loopback hosts and the configured `httpHost`. Same semantics as
   * `sseAllowedOrigins` but applies to the `/mcp` endpoint in `http` mode.
   * Defaults to an empty list.
   */
  httpAllowedOrigins?: string[];
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

  /**
   * Transport protocol configuration (default: stdio)
   */
  transport?: TransportConfig;

  /**
   * Named environment profiles selectable per call via the `profile` parameter
   * on execute_command. Absence preserves current behavior (no profile env is
   * injected).
   */
  profiles?: Record<string, EnvProfileConfig>;
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
