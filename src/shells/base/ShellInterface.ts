/**
 * Shell configuration for modular shell plugins
 *
 * This is a simplified configuration specifically for shell plugins.
 * It may be mapped to/from the existing BaseShellConfig as needed.
 */
export interface ShellConfig {
  enabled: boolean;
  shellCommand: string;
  shellArgs: string[];
  timeout: number;
  maxOutputLines: number;
  security: {
    allowCommandChaining: boolean;
    allowPipeOperators: boolean;
    allowRedirection: boolean;
    validatePaths: boolean;
  };
  restrictions: {
    allowedCommands: string[];
    blockedCommands: string[];
    allowedPaths: string[];
    blockedPaths: string[];
    requirePathValidation: boolean;
  };
  paths: {
    enforceAbsolutePaths: boolean;
    pathStyle: 'unix' | 'windows';
    wslMountPoint?: string;
  };
}

export interface ValidationContext {
  shellType: string;
  workingDirectory?: string;
  allowedCommands?: string[];
  blockedCommands?: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

export interface ExecutionOptions {
  command: string;
  workingDirectory?: string;
  timeout?: number;
  environment?: Record<string, string>;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: Error;
}

/**
 * Shell Plugin Interface
 *
 * Each shell implementation must implement this interface to be registered
 * with the shell registry and used by the MCP server.
 */
export interface ShellPlugin {
  /** Unique shell identifier (e.g., 'powershell', 'gitbash') */
  readonly shellType: string;

  /** Display name for UI/docs */
  readonly displayName: string;

  /** Default configuration for this shell */
  readonly defaultConfig: ShellConfig;

  /** Validate a command for this shell */
  validateCommand(
    command: string,
    context: ValidationContext
  ): ValidationResult;

  /** Validate a path for this shell */
  validatePath(
    path: string,
    context: ValidationContext
  ): ValidationResult;

  /** Execute a command (optional - can use default executor) */
  executeCommand?(
    command: string,
    options: ExecutionOptions
  ): Promise<ExecutionResult>;

  /** Get shell-specific blocked commands */
  getBlockedCommands(): string[];

  /** Get shell-specific tool schema extensions */
  getToolSchemaExtensions?(): Record<string, any>;

  /** Merge configuration with shell-specific logic */
  mergeConfig(
    base: ShellConfig,
    override: Partial<ShellConfig>
  ): ShellConfig;
}
