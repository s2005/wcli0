import fs from 'fs';
import path from 'path';
import os from 'os';
import { ServerConfig, ResolvedShellConfig, WslShellConfig, BaseShellConfig } from '../types/config.js';
import { normalizeWindowsPath, normalizeAllowedPaths } from './validation.js';
import { resolveShellConfiguration, applyWslPathInheritance } from './configMerger.js';
import { debugWarn, errorLog } from './log.js';

const defaultValidatePathRegex = /^[a-zA-Z]:\\(?:[^<>:"/\\|?*]+\\)*[^<>:"/\\|?*]*$/;

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
    }
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
      validatePath: (dir: string) => /^(\/mnt\/[a-zA-Z]\/|\/)/.test(dir),
      wslConfig: {
        mountPoint: '/mnt/',
        inheritGlobalPaths: true
      }
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
      }
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