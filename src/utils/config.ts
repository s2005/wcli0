import fs from 'fs';
import path from 'path';
import os from 'os';
import { ServerConfig, ResolvedShellConfig } from '../types/config.js';
import { normalizeWindowsPath, normalizeAllowedPaths } from './validation.js';
import { resolveShellConfiguration, applyWslPathInheritance } from './configMerger.js';

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
      allowedPaths: [
        os.homedir(),
        process.cwd()
      ],
      initialDir: undefined
    }
  },
  shells: {
    powershell: {
      enabled: true,
      executable: {
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-Command']
      },
      validatePath: (dir: string) => /^[a-zA-Z]:\\/.test(dir)
    },
    cmd: {
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
    wsl: {
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

export function loadConfig(configPath?: string): ServerConfig {
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
      console.error(`Error loading config from ${location}:`, error);
    }
  }

  // Use defaults if no config was loaded or merge with loaded config
  const config = Object.keys(loadedConfig).length > 0
    ? mergeConfigs(DEFAULT_CONFIG, loadedConfig)
    : { ...DEFAULT_CONFIG };
  
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
      console.warn(`WARN: Configured initialDir '${config.global.paths.initialDir}' does not exist.`);
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
  
  // Special handling for WSL path inheritance
  if (shellName === 'wsl' && resolved.wslConfig) {
    resolved = applyWslPathInheritance(resolved, config.global.paths.allowedPaths);
  }
  
  return resolved;
}

function mergeConfigs(defaultConfig: ServerConfig, userConfig: Partial<ServerConfig>): ServerConfig {
  const merged: ServerConfig = {
    global: {
      security: {
        // Start with defaults then override with any user supplied options
        ...defaultConfig.global.security,
        ...(userConfig.global?.security || {})
      },
      restrictions: {
        // Merge arrays properly - only use user config arrays if they have content,
        // otherwise keep defaults
        blockedCommands: (userConfig.global?.restrictions?.blockedCommands && userConfig.global.restrictions.blockedCommands.length > 0) 
          ? userConfig.global.restrictions.blockedCommands 
          : defaultConfig.global.restrictions.blockedCommands,
        blockedArguments: (userConfig.global?.restrictions?.blockedArguments && userConfig.global.restrictions.blockedArguments.length > 0)
          ? userConfig.global.restrictions.blockedArguments
          : defaultConfig.global.restrictions.blockedArguments,
        blockedOperators: (userConfig.global?.restrictions?.blockedOperators && userConfig.global.restrictions.blockedOperators.length > 0)
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
  const shouldIncludeWSL = userConfig.shells?.wsl !== undefined || defaultConfig.shells.wsl !== undefined;

  // Add each shell, ensuring required properties are always set
  if (shouldIncludePowerShell) {
    const baseShell = defaultConfig.shells.powershell || {
      enabled: false,
      executable: { command: '', args: [] }
    };
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
    const baseShell = defaultConfig.shells.cmd || {
      enabled: false,
      executable: { command: '', args: [] }
    };
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
    const baseShell = defaultConfig.shells.gitbash || {
      enabled: false,
      executable: { command: '', args: [] }
    };
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

  if (shouldIncludeWSL) {
    const baseShell = defaultConfig.shells.wsl || {
      enabled: false,
      executable: { command: '', args: [] },
      wslConfig: {
        mountPoint: '/mnt/',
        inheritGlobalPaths: true
      }
    };
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

function validateConfig(config: ServerConfig): void {
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