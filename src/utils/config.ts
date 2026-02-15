import fs from 'fs';
import path from 'path';
import os from 'os';
import { ServerConfig, ResolvedShellConfig, WslShellConfig, BaseShellConfig, LoggingConfig } from '../types/config.js';
import { normalizeWindowsPath, normalizeAllowedPaths } from './validation.js';
import { resolveShellConfiguration, applyWslPathInheritance } from './configMerger.js';
import { debugWarn, errorLog } from './log.js';

const defaultValidatePathRegex = /^[a-zA-Z]:\\(?:[^<>:"/\\|?*]+\\)*[^<>:"/\\|?*]*$/;

/**
 * Default logging configuration.
 *
 * Note: logRetentionDays takes precedence over logRetentionMinutes when both are set.
 * The default only sets logRetentionMinutes to allow fine-grained control.
 * Set logRetentionDays in your config for day-based retention.
 */
const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  maxOutputLines: 20,
  enableTruncation: true,
  truncationMessage: '[Output truncated: Showing last {returnedLines} of {totalLines} lines]',
  maxStoredLogs: 50,
  maxLogSize: 1048576, // 1MB
  maxTotalStorageSize: 52428800, // 50MB - in-memory output buffer limit
  enableLogResources: true,
  logRetentionMinutes: 24 * 60, // Default 24 hours; logRetentionDays overrides if set
  cleanupIntervalMinutes: 5,
  logDirectory: undefined,
  // logRetentionDays: intentionally not set - allows logRetentionMinutes to work as default
  maxTotalLogSize: 104857600, // 100MB - on-disk log file storage limit
  maxReturnLines: 500,
  maxReturnBytes: 1048576, // 1MB cap for retrieval
  exposeFullPath: false
};

export const DEFAULT_CONFIG: ServerConfig = {
  global: {
    security: {
      maxCommandLength: 2000,
      commandTimeout: 30,
      enableInjectionProtection: true,
      restrictWorkingDirectory: true
    },
    restrictions: {
      blockedCommands: [
        'format', 'shutdown', 'restart',
        'reg', 'regedit',
        'net', 'netsh',
        'takeown', 'icacls'
      ],
      blockedArguments: [
        "--exec", "-e", "/c", "-enc", "-encodedcommand",
        "-command", "--interactive", "-i", "--login", "--system"
      ],
      blockedOperators: ['&', '|', ';', '`']
    },
    paths: {
      allowedPaths: [],
      initialDir: undefined
    },
    logging: DEFAULT_LOGGING_CONFIG
  },
  shells: {
    powershell: {
      type: 'powershell',
      enabled: true,
      executable: {
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command']
      },
      validatePath: (dir: string) => /^[a-zA-Z]:\\/.test(dir)
    },
    cmd: {
      type: 'cmd',
      enabled: true,
      executable: {
        command: 'cmd.exe',
        args: ['/c']
      },
      validatePath: (dir: string) => /^[a-zA-Z]:\\/.test(dir),
      overrides: {
        restrictions: {
          blockedCommands: ['del', 'rd', 'rmdir']
        }
      }
    },
    gitbash: {
      type: 'gitbash',
      enabled: true,
      executable: {
        command: 'C:\\Program Files\\Git\\bin\\bash.exe',
        args: ['-c']
      },
      validatePath: (dir: string) => /^([a-zA-Z]:\\|\/[a-z]\/)/.test(dir),
      overrides: {
        restrictions: {
          blockedCommands: ['rm']
        }
      }
    },
    bash: {
      type: 'bash',
      enabled: true,
      executable: {
        command: 'bash',
        args: ['-c']
      },
      validatePath: (dir: string) => /^\/|^\.\.?[/]/.test(dir)
    },
    wsl: {
      type: 'wsl',
      enabled: true,
      executable: {
        command: 'wsl.exe',
        args: ['-e']
      },
      validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
      wslConfig: {
        mountPoint: '/mnt/',
        inheritGlobalPaths: true
      }
    }
  }
};

export function loadConfig(configPath?: string, disableIfEmpty = false): ServerConfig {
  // If no config path provided, look in default locations
  const configLocations = [
    configPath,
    path.join(process.cwd(), 'config.json'),
    path.join(os.homedir(), '.win-cli-mcp', 'config.json')
  ].filter(Boolean);

  let loadedConfig: Partial<ServerConfig> = {};

  for (const location of configLocations) {
    if (!location) continue;

    try {
      if (fs.existsSync(location)) {
        const fileContent = fs.readFileSync(location, 'utf8');
        loadedConfig = JSON.parse(fileContent);
        break;
      }
    } catch (error) {
      errorLog(`Error loading config from ${location}:`, error);
    }
  }

  // Use defaults if no config was loaded or merge with loaded config
  const userProvidedConfig = Object.keys(loadedConfig).length > 0;

  const config = userProvidedConfig
    ? mergeConfigs(DEFAULT_CONFIG, loadedConfig)
    : { ...DEFAULT_CONFIG };

  if (!config.global.paths.allowedPaths) {
    config.global.paths.allowedPaths = [];
  }

  if (
    disableIfEmpty &&
    config.global.security.restrictWorkingDirectory &&
    config.global.paths.allowedPaths.length === 0 &&
    !config.global.paths.initialDir
  ) {
    config.global.security.restrictWorkingDirectory = false;
  }

  // Validate and process initialDir if provided
  if (config.global.paths.initialDir) {
    const normalizedInitialDir = normalizeWindowsPath(config.global.paths.initialDir);
    if (fs.existsSync(normalizedInitialDir) && fs.statSync(normalizedInitialDir).isDirectory()) {
      config.global.paths.initialDir = normalizedInitialDir;
      if (config.global.security.restrictWorkingDirectory) {
        if (!config.global.paths.allowedPaths.includes(normalizedInitialDir)) {
          config.global.paths.allowedPaths.push(normalizedInitialDir);
        }
      }
    } else {
      debugWarn(`WARN: Configured initialDir '${config.global.paths.initialDir}' does not exist.`);
      config.global.paths.initialDir = undefined;
    }
  }

  // Normalize allowed paths
  config.global.paths.allowedPaths = normalizeAllowedPaths(
    config.global.paths.allowedPaths
  );

  // Validate configuration at startup to catch errors early
  validateConfig(config);

  return config;
}

/**
 * Get resolved configuration for a specific shell
 */
export function getResolvedShellConfig(
  config: ServerConfig,
  shellName: keyof ServerConfig['shells']
): ResolvedShellConfig | null {
  const shell = config.shells[shellName];
  if (!shell || !shell.enabled) {
    return null;
  }

  let resolved = resolveShellConfiguration(config.global, shell);

  // Special handling for WSL/Bash path inheritance
  if ((resolved.type === 'wsl' || resolved.type === 'bash') && resolved.wslConfig) {
    resolved = applyWslPathInheritance(resolved, config.global.paths.allowedPaths);
  }

  return resolved;
}

export function mergeConfigs(defaultConfig: ServerConfig, userConfig: Partial<ServerConfig>): ServerConfig {
  const merged: ServerConfig = {
    global: {
      security: {
        // Start with defaults then override with any user supplied options
        ...defaultConfig.global.security,
        ...(userConfig.global?.security || {})
      },
      restrictions: {
        // Use user provided arrays even if empty. Fall back to defaults when undefined.
        blockedCommands: userConfig.global?.restrictions?.blockedCommands !== undefined
          ? userConfig.global.restrictions.blockedCommands
          : defaultConfig.global.restrictions.blockedCommands,
        blockedArguments: userConfig.global?.restrictions?.blockedArguments !== undefined
          ? userConfig.global.restrictions.blockedArguments
          : defaultConfig.global.restrictions.blockedArguments,
        blockedOperators: userConfig.global?.restrictions?.blockedOperators !== undefined
          ? userConfig.global.restrictions.blockedOperators
          : defaultConfig.global.restrictions.blockedOperators
      },
      paths: {
        ...defaultConfig.global.paths,
        ...(userConfig.global?.paths || {})
      },
      logging: defaultConfig.global.logging ? {
        ...defaultConfig.global.logging,
        ...(userConfig.global?.logging || {})
      } : undefined
    },
    shells: {}
  };

  // Determine which shells should be included
  const shouldIncludePowerShell = userConfig.shells?.powershell !== undefined || defaultConfig.shells.powershell !== undefined;
  const shouldIncludeCmd = userConfig.shells?.cmd !== undefined || defaultConfig.shells.cmd !== undefined;
  const shouldIncludeGitBash = userConfig.shells?.gitbash !== undefined || defaultConfig.shells.gitbash !== undefined;
  const shouldIncludeBash = userConfig.shells?.bash !== undefined || defaultConfig.shells.bash !== undefined;
  const shouldIncludeWSL = userConfig.shells?.wsl !== undefined || defaultConfig.shells.wsl !== undefined;

  // Add each shell, ensuring required properties are always set
  if (shouldIncludePowerShell) {
    const userShell = userConfig.shells?.powershell;
    const baseShell: BaseShellConfig = defaultConfig.shells.powershell
      ? {
        ...defaultConfig.shells.powershell,
        overrides: defaultConfig.shells.powershell.overrides
          ? {
            ...defaultConfig.shells.powershell.overrides,
            restrictions: defaultConfig.shells.powershell.overrides.restrictions
              ? { ...defaultConfig.shells.powershell.overrides.restrictions }
              : undefined
          }
          : undefined
      }
      : {
        type: 'powershell',
        enabled: false,
        executable: { command: '', args: [] }
      };
    if (userShell && !userShell.overrides?.restrictions && baseShell.overrides?.restrictions) {
      const { restrictions, ...rest } = baseShell.overrides;
      baseShell.overrides = Object.keys(rest).length > 0 ? rest : undefined;
    }
    merged.shells.powershell = {
      // Start with defaults
      ...baseShell,
      // Override with user config
      ...(userConfig.shells?.powershell || {}),
      // Ensure required properties
      enabled: (userConfig.shells?.powershell?.enabled !== undefined) ?
        userConfig.shells.powershell.enabled :
        (baseShell.enabled !== undefined ? baseShell.enabled : true)
    };
    // Ensure executable is properly set
    if (!merged.shells.powershell.executable) {
      merged.shells.powershell.executable = { command: '', args: [] };
    }
  }

  if (shouldIncludeCmd) {
    const userShell = userConfig.shells?.cmd;
    const baseShell: BaseShellConfig = defaultConfig.shells.cmd
      ? {
        ...defaultConfig.shells.cmd,
        overrides: defaultConfig.shells.cmd.overrides
          ? {
            ...defaultConfig.shells.cmd.overrides,
            restrictions: defaultConfig.shells.cmd.overrides.restrictions
              ? { ...defaultConfig.shells.cmd.overrides.restrictions }
              : undefined
          }
          : undefined
      }
      : {
        type: 'cmd',
        enabled: false,
        executable: { command: '', args: [] }
      };
    if (userShell && !userShell.overrides?.restrictions && baseShell.overrides?.restrictions) {
      const { restrictions, ...rest } = baseShell.overrides;
      baseShell.overrides = Object.keys(rest).length > 0 ? rest : undefined;
    }
    merged.shells.cmd = {
      // Start with defaults
      ...baseShell,
      // Override with user config
      ...(userConfig.shells?.cmd || {}),
      // Ensure required properties
      enabled: (userConfig.shells?.cmd?.enabled !== undefined) ?
        userConfig.shells.cmd.enabled :
        (baseShell.enabled !== undefined ? baseShell.enabled : true)
    };
    // Ensure executable is properly set
    if (!merged.shells.cmd.executable) {
      merged.shells.cmd.executable = { command: '', args: [] };
    }
  }

  if (shouldIncludeGitBash) {
    const userShell = userConfig.shells?.gitbash;
    const baseShell: BaseShellConfig = defaultConfig.shells.gitbash
      ? {
        ...defaultConfig.shells.gitbash,
        overrides: defaultConfig.shells.gitbash.overrides
          ? {
            ...defaultConfig.shells.gitbash.overrides,
            restrictions: defaultConfig.shells.gitbash.overrides.restrictions
              ? { ...defaultConfig.shells.gitbash.overrides.restrictions }
              : undefined
          }
          : undefined
      }
      : {
        type: 'gitbash',
        enabled: false,
        executable: { command: '', args: [] }
      };
    if (userShell && !userShell.overrides?.restrictions && baseShell.overrides?.restrictions) {
      const { restrictions, ...rest } = baseShell.overrides;
      baseShell.overrides = Object.keys(rest).length > 0 ? rest : undefined;
    }
    merged.shells.gitbash = {
      // Start with defaults
      ...baseShell,
      // Override with user config
      ...(userConfig.shells?.gitbash || {}),
      // Ensure required properties
      enabled: (userConfig.shells?.gitbash?.enabled !== undefined) ?
        userConfig.shells.gitbash.enabled :
        (baseShell.enabled !== undefined ? baseShell.enabled : true)
    };
    // Ensure executable is properly set
    if (!merged.shells.gitbash.executable) {
      merged.shells.gitbash.executable = { command: '', args: [] };
    }
  }

  if (shouldIncludeBash) {
    const userShell = userConfig.shells?.bash;
    const baseShell: WslShellConfig = defaultConfig.shells.bash
      ? {
        ...defaultConfig.shells.bash,
        overrides: defaultConfig.shells.bash.overrides
          ? {
            ...defaultConfig.shells.bash.overrides,
            restrictions: defaultConfig.shells.bash.overrides.restrictions
              ? { ...defaultConfig.shells.bash.overrides.restrictions }
              : undefined
          }
          : undefined
      }
      : {
        type: 'bash',
        enabled: false,
        executable: { command: '', args: [] },
        wslConfig: {
          mountPoint: '/mnt/',
          inheritGlobalPaths: true
        }
      } as WslShellConfig;
    if (userShell && !userShell.overrides?.restrictions && baseShell.overrides?.restrictions) {
      const { restrictions, ...rest } = baseShell.overrides;
      baseShell.overrides = Object.keys(rest).length > 0 ? rest : undefined;
    }
    merged.shells.bash = {
      ...baseShell,
      ...(userConfig.shells?.bash || {}),
      enabled: (userConfig.shells?.bash?.enabled !== undefined) ?
        userConfig.shells.bash.enabled :
        (baseShell.enabled !== undefined ? baseShell.enabled : true),
      wslConfig: {
        ...(baseShell as any).wslConfig,
        ...((userConfig.shells?.bash as any)?.wslConfig || {}),
        mountPoint: ((userConfig.shells?.bash as any)?.wslConfig?.mountPoint !== undefined) ?
          (userConfig.shells?.bash as any).wslConfig.mountPoint :
          ((baseShell as any).wslConfig?.mountPoint || '/mnt/'),
        inheritGlobalPaths: ((userConfig.shells?.bash as any)?.wslConfig?.inheritGlobalPaths !== undefined) ?
          (userConfig.shells?.bash as any).wslConfig.inheritGlobalPaths :
          ((baseShell as any).wslConfig?.inheritGlobalPaths !== undefined ?
            (baseShell as any).wslConfig.inheritGlobalPaths : true)
      }
    } as WslShellConfig;
    if (!merged.shells.bash.executable) {
      merged.shells.bash.executable = { command: '', args: [] };
    }
  }

  if (shouldIncludeWSL) {
    const userShell = userConfig.shells?.wsl;
    const baseShell: WslShellConfig = defaultConfig.shells.wsl
      ? {
        ...defaultConfig.shells.wsl,
        overrides: defaultConfig.shells.wsl.overrides
          ? {
            ...defaultConfig.shells.wsl.overrides,
            restrictions: defaultConfig.shells.wsl.overrides.restrictions
              ? { ...defaultConfig.shells.wsl.overrides.restrictions }
              : undefined
          }
          : undefined,
      }
      : {
        type: 'wsl',
        enabled: false,
        executable: { command: '', args: [] },
        wslConfig: {
          mountPoint: '/mnt/',
          inheritGlobalPaths: true
        }
      };
    if (userShell && !userShell.overrides?.restrictions && baseShell.overrides?.restrictions) {
      const { restrictions, ...rest } = baseShell.overrides;
      baseShell.overrides = Object.keys(rest).length > 0 ? rest : undefined;
    }
    merged.shells.wsl = {
      // Start with defaults
      ...baseShell,
      // Override with user config
      ...(userConfig.shells?.wsl || {}),
      // Ensure required properties
      enabled: (userConfig.shells?.wsl?.enabled !== undefined) ?
        userConfig.shells.wsl.enabled :
        (baseShell.enabled !== undefined ? baseShell.enabled : true),
      // Ensure wslConfig exists with default values if not provided
      wslConfig: {
        ...((baseShell as any).wslConfig || {}),
        ...((userConfig.shells?.wsl as any)?.wslConfig || {}),
        mountPoint: ((userConfig.shells?.wsl as any)?.wslConfig?.mountPoint !== undefined) ?
          (userConfig.shells?.wsl as any).wslConfig.mountPoint :
          ((baseShell as any).wslConfig?.mountPoint || '/mnt/'),
        inheritGlobalPaths: ((userConfig.shells?.wsl as any)?.wslConfig?.inheritGlobalPaths !== undefined) ?
          (userConfig.shells?.wsl as any).wslConfig.inheritGlobalPaths :
          ((baseShell as any).wslConfig?.inheritGlobalPaths !== undefined ?
            (baseShell as any).wslConfig.inheritGlobalPaths : true)
      }
    };
    // Ensure executable is properly set
    if (!merged.shells.wsl.executable) {
      merged.shells.wsl.executable = { command: '', args: [] };
    }
  }

  return merged;
}

/**
 * Validates logging configuration values
 */
function validateLoggingConfig(config?: LoggingConfig): void {
  if (!config) return;

  if (config.maxOutputLines !== undefined) {
    if (config.maxOutputLines < 1 || config.maxOutputLines > 10000) {
      throw new Error('maxOutputLines must be between 1 and 10000');
    }
  }

  if (config.maxStoredLogs !== undefined) {
    if (config.maxStoredLogs < 1 || config.maxStoredLogs > 1000) {
      throw new Error('maxStoredLogs must be between 1 and 1000');
    }
  }

  if (config.maxLogSize !== undefined) {
    if (config.maxLogSize < 1024 || config.maxLogSize > 10485760) {
      throw new Error('maxLogSize must be between 1KB (1024 bytes) and 10MB (10485760 bytes)');
    }
  }

  if (config.maxTotalStorageSize !== undefined) {
    if (config.maxTotalStorageSize < 10240 || config.maxTotalStorageSize > 1073741824) {
      throw new Error('maxTotalStorageSize must be between 10KB and 1GB');
    }
  }

  if (config.logRetentionMinutes !== undefined) {
    if (config.logRetentionMinutes < 1 || config.logRetentionMinutes > 10080) {
      throw new Error('logRetentionMinutes must be between 1 and 10080 (1 week)');
    }
  }

  if (config.cleanupIntervalMinutes !== undefined) {
    if (config.cleanupIntervalMinutes < 1 || config.cleanupIntervalMinutes > 1440) {
      throw new Error('cleanupIntervalMinutes must be between 1 and 1440 (1 day)');
    }
  }

  if (config.logRetentionDays !== undefined) {
    if (
      !Number.isInteger(config.logRetentionDays) ||
      config.logRetentionDays < 1 ||
      config.logRetentionDays > 365
    ) {
      throw new Error('logRetentionDays must be an integer between 1 and 365');
    }
  }

  if (config.logDirectory !== undefined) {
    if (typeof config.logDirectory !== 'string' || config.logDirectory.trim() === '') {
      throw new Error('logDirectory must be a non-empty string');
    }

    const normalized = path.normalize(config.logDirectory);
    if (normalized.includes('..')) {
      throw new Error('logDirectory must not contain path traversal (..)');
    }

    if (process.platform === 'win32') {
      const invalidChars = /[<>\"|?*]/;
      const withoutDrive = normalized.replace(/^[a-zA-Z]:/, '');
      if (invalidChars.test(withoutDrive)) {
        throw new Error('logDirectory contains invalid characters');
      }
    }
  }

  if (config.maxReturnLines !== undefined) {
    if (
      !Number.isInteger(config.maxReturnLines) ||
      config.maxReturnLines < 1 ||
      config.maxReturnLines > 10000
    ) {
      throw new Error('maxReturnLines must be an integer between 1 and 10000');
    }
  }

  if (config.maxTotalLogSize !== undefined) {
    if (
      typeof config.maxTotalLogSize !== 'number' ||
      config.maxTotalLogSize < 1048576 ||
      config.maxTotalLogSize > 1073741824
    ) {
      throw new Error('maxTotalLogSize must be between 1MB and 1GB');
    }
  }

  if (config.maxReturnBytes !== undefined) {
    if (
      typeof config.maxReturnBytes !== 'number' ||
      config.maxReturnBytes < 1024 ||
      config.maxReturnBytes > 10485760
    ) {
      throw new Error('maxReturnBytes must be between 1KB and 10MB');
    }
  }

  if (config.exposeFullPath !== undefined && typeof config.exposeFullPath !== 'boolean') {
    throw new Error('exposeFullPath must be a boolean');
  }
}

export function validateConfig(config: ServerConfig): void {
  // Validate security settings
  if (config.global.security.maxCommandLength < 1) {
    throw new Error('maxCommandLength must be positive');
  }

  // Validate shell configurations
  for (const [shellName, shell] of Object.entries(config.shells)) {
    if (shell.enabled && (!shell.executable?.command || !shell.executable?.args)) {
      throw new Error(`Invalid configuration for ${shellName}: missing executable command or args`);
    }
  }

  // Validate timeout (minimum 1 second)
  if (config.global.security.commandTimeout < 1) {
    throw new Error('commandTimeout must be at least 1 second');
  }

  // Validate logging configuration
  validateLoggingConfig(config.global.logging);
}

// Helper function to create a default config file
export function createDefaultConfig(configPath: string): void {
  const dirPath = path.dirname(configPath);

  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  // Create a JSON-safe version of the config (excluding functions)
  const configForSave = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  // Remove validatePath functions as they can't be serialized to JSON
  for (const shellName in configForSave.shells) {
    if (configForSave.shells[shellName]) {
      delete configForSave.shells[shellName].validatePath;
    }
  }

  fs.writeFileSync(configPath, JSON.stringify(configForSave, null, 2));
}

export function applyCliInitialDir(config: ServerConfig, dir?: string): void {
  if (!dir) return;

  const normalized = normalizeWindowsPath(dir);
  if (fs.existsSync(normalized) && fs.statSync(normalized).isDirectory()) {
    config.global.paths.initialDir = normalized;
    if (config.global.security.restrictWorkingDirectory) {
      if (!config.global.paths.allowedPaths.includes(normalized)) {
        config.global.paths.allowedPaths.push(normalized);
      }
    }
  } else {
    debugWarn(`WARN: Provided initialDir '${dir}' does not exist.`);
  }

  config.global.paths.allowedPaths = normalizeAllowedPaths(
    config.global.paths.allowedPaths
  );
}

export function applyCliShellAndAllowedDirs(
  config: ServerConfig,
  shellName?: string,
  allowedDirs: string[] = []
): void {
  if (shellName) {
    for (const name of Object.keys(config.shells)) {
      const shell = (config.shells as Record<string, any>)[name];
      if (shell) {
        shell.enabled = name === shellName;
      }
    }

    const key = shellName as keyof ServerConfig['shells'];
    if (allowedDirs.length > 0 && config.shells[key]) {
      const shell = config.shells[key]!;
      shell.overrides = shell.overrides || {};
      shell.overrides.paths = shell.overrides.paths || {};
      shell.overrides.paths.allowedPaths = [...allowedDirs];
    }
  }

  if (allowedDirs.length > 0) {
    config.global.paths.allowedPaths = normalizeAllowedPaths(allowedDirs);
    config.global.security.restrictWorkingDirectory = true;
    config.global.security.enableInjectionProtection = false;
  }
}

export function applyCliSecurityOverrides(
  config: ServerConfig,
  maxCommandLength?: number,
  commandTimeout?: number
): void {
  if (typeof maxCommandLength === 'number' && maxCommandLength > 0) {
    config.global.security.maxCommandLength = maxCommandLength;
  } else if (maxCommandLength !== undefined) {
    debugWarn(`WARN: Invalid maxCommandLength '${maxCommandLength}', ignoring.`);
  }

  if (typeof commandTimeout === 'number' && commandTimeout > 0) {
    config.global.security.commandTimeout = commandTimeout;
  } else if (commandTimeout !== undefined) {
    debugWarn(`WARN: Invalid commandTimeout '${commandTimeout}', ignoring.`);
  }
}

export function applyCliWslMountPoint(
  config: ServerConfig,
  mountPoint?: string
): void {
  if (!mountPoint) return;

  const normalized = mountPoint.endsWith('/') ? mountPoint : mountPoint + '/';
  const shells: (keyof ServerConfig['shells'])[] = ['wsl', 'bash'];

  for (const name of shells) {
    const shell = config.shells[name] as WslShellConfig | undefined;
    if (shell) {
      shell.wslConfig = shell.wslConfig || {};
      shell.wslConfig.mountPoint = normalized;
    }
  }
}

export function applyCliRestrictions(
  config: ServerConfig,
  blockedCommands?: string[],
  blockedArguments?: string[],
  blockedOperators?: string[]
): void {
  if (blockedCommands !== undefined) {
    const list = blockedCommands.length === 1 && blockedCommands[0] === ''
      ? []
      : blockedCommands;
    config.global.restrictions.blockedCommands = list;
  }

  if (blockedArguments !== undefined) {
    const list = blockedArguments.length === 1 && blockedArguments[0] === ''
      ? []
      : blockedArguments;
    config.global.restrictions.blockedArguments = list;
  }

  if (blockedOperators !== undefined) {
    const list = blockedOperators.length === 1 && blockedOperators[0] === ''
      ? []
      : blockedOperators;
    config.global.restrictions.blockedOperators = list;
  }
}

export function applyCliLogging(
  config: ServerConfig,
  maxOutputLines?: number,
  enableTruncation?: boolean,
  enableLogResources?: boolean,
  maxReturnLines?: number,
  logDirectory?: string
): void {
  // Check if any valid logging option is provided
  const hasValidOptions =
    (maxOutputLines !== undefined && maxOutputLines > 0) ||
    enableTruncation !== undefined ||
    enableLogResources !== undefined ||
    (maxReturnLines !== undefined && maxReturnLines > 0) ||
    (logDirectory !== undefined && logDirectory.trim() !== '');

  if (!hasValidOptions) {
    return;
  }

  // Initialize logging config if not present
  if (!config.global.logging) {
    config.global.logging = { ...DEFAULT_LOGGING_CONFIG };
  }

  if (maxOutputLines !== undefined && maxOutputLines > 0) {
    config.global.logging.maxOutputLines = maxOutputLines;
  }

  if (enableTruncation !== undefined) {
    config.global.logging.enableTruncation = enableTruncation;
  }

  if (enableLogResources !== undefined) {
    config.global.logging.enableLogResources = enableLogResources;
  }

  if (maxReturnLines !== undefined && maxReturnLines > 0) {
    config.global.logging.maxReturnLines = maxReturnLines;
  }

  if (logDirectory !== undefined && logDirectory.trim() !== '') {
    config.global.logging.logDirectory = logDirectory.trim();
  }
}

export function getDefaultDebugLogDirectory(): string {
  return path.join(os.tmpdir(), 'wcli0-debug-logs');
}

export function applyDebugLogDirectory(
  config: ServerConfig,
  debugEnabled: boolean
): void {
  if (!debugEnabled) {
    return;
  }

  if (!config.global.logging) {
    config.global.logging = { ...DEFAULT_LOGGING_CONFIG };
  }

  const hasLogDirectory = config.global.logging.logDirectory?.trim();
  if (!hasLogDirectory) {
    config.global.logging.logDirectory = getDefaultDebugLogDirectory();
  }
}

export function applyCliUnsafeMode(
  config: ServerConfig,
  unsafeOptions?: { unsafe?: boolean; yolo?: boolean }
): void {
  if (!unsafeOptions) return;

  const { unsafe, yolo } = unsafeOptions;
  if (!unsafe && !yolo) return;

  if (unsafe && yolo) {
    throw new Error('Cannot enable both --unsafe and --yolo modes at the same time.');
  }

  const mode = unsafe ? 'unsafe' : 'yolo';

  // Disable all global safety checks first
  config.global.security.enableInjectionProtection = false;
  config.global.restrictions.blockedCommands = [];
  config.global.restrictions.blockedArguments = [];
  config.global.restrictions.blockedOperators = [];

  // Apply mode-specific directory handling
  if (mode === 'unsafe') {
    config.global.security.restrictWorkingDirectory = false;
  } else {
    config.global.security.restrictWorkingDirectory = true;
  }

  // Clear shell-specific overrides
  for (const shellName of Object.keys(config.shells)) {
    const shell = config.shells[shellName as keyof ServerConfig['shells']];
    if (shell && shell.overrides) {
      if (shell.overrides.security) {
        shell.overrides.security.enableInjectionProtection = false;
      }

      if (shell.overrides.restrictions) {
        shell.overrides.restrictions.blockedCommands = [];
        shell.overrides.restrictions.blockedArguments = [];
        shell.overrides.restrictions.blockedOperators = [];
      }
    }
  }
}
