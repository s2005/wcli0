import type { ServerConfig, ResolvedShellConfig } from '../types/config.js';

/**
 * Create a safe, serializable version of the configuration for external use
 */
export function createSerializableConfig(config: ServerConfig): any {
  const serializable: any = {
    global: {
      security: {
        maxCommandLength: config.global.security.maxCommandLength,
        commandTimeout: config.global.security.commandTimeout,
        enableInjectionProtection: config.global.security.enableInjectionProtection,
        restrictWorkingDirectory: config.global.security.restrictWorkingDirectory
      },
      restrictions: {
        blockedCommands: [...config.global.restrictions.blockedCommands],
        blockedArguments: [...config.global.restrictions.blockedArguments],
        blockedOperators: [...config.global.restrictions.blockedOperators]
      },
      paths: {
        allowedPaths: [...config.global.paths.allowedPaths],
        initialDir: config.global.paths.initialDir
      }
    },
    shells: {}
  };

  // Add shell configurations
  for (const [shellName, shellConfig] of Object.entries(config.shells)) {
    if (!shellConfig) continue;

    const shellInfo: any = {
      enabled: shellConfig.enabled,
      executable: {
        command: shellConfig.executable.command,
        args: [...shellConfig.executable.args]
      }
    };

    if (shellConfig.overrides) {
      shellInfo.overrides = {};
      if (shellConfig.overrides.security) {
        shellInfo.overrides.security = { ...shellConfig.overrides.security };
      }
      if (shellConfig.overrides.restrictions) {
        shellInfo.overrides.restrictions = {
          blockedCommands: shellConfig.overrides.restrictions.blockedCommands ?
            [...shellConfig.overrides.restrictions.blockedCommands] : undefined,
          blockedArguments: shellConfig.overrides.restrictions.blockedArguments ?
            [...shellConfig.overrides.restrictions.blockedArguments] : undefined,
          blockedOperators: shellConfig.overrides.restrictions.blockedOperators ?
            [...shellConfig.overrides.restrictions.blockedOperators] : undefined
        };
      }
      if (shellConfig.overrides.paths) {
        shellInfo.overrides.paths = {
          allowedPaths: shellConfig.overrides.paths.allowedPaths ?
            [...shellConfig.overrides.paths.allowedPaths] : undefined,
          initialDir: shellConfig.overrides.paths.initialDir
        };
      }
    }

    if ('wslConfig' in shellConfig && (shellConfig as any).wslConfig) {
      const wc = (shellConfig as any).wslConfig;
      shellInfo.wslConfig = {
        mountPoint: wc.mountPoint,
        inheritGlobalPaths: wc.inheritGlobalPaths,
        pathMapping: wc.pathMapping ? {
          enabled: wc.pathMapping.enabled,
          windowsToWsl: wc.pathMapping.windowsToWsl
        } : undefined
      };
    }

    serializable.shells[shellName] = shellInfo;
  }

  return serializable;
}

/**
 * Create a summary of resolved configuration for a specific shell
 */
export function createResolvedConfigSummary(
  shellName: string,
  resolved: ResolvedShellConfig
): any {
  return {
    shell: shellName,
    enabled: resolved.enabled,
    executable: {
      command: resolved.executable.command,
      args: [...resolved.executable.args]
    },
    effectiveSettings: {
      security: { ...resolved.security },
      restrictions: {
        blockedCommands: [...resolved.restrictions.blockedCommands],
        blockedArguments: [...resolved.restrictions.blockedArguments],
        blockedOperators: [...resolved.restrictions.blockedOperators]
      },
      paths: {
        allowedPaths: [...resolved.paths.allowedPaths],
        initialDir: resolved.paths.initialDir
      }
    },
    wslConfig: resolved.wslConfig ? {
      mountPoint: resolved.wslConfig.mountPoint,
      inheritGlobalPaths: resolved.wslConfig.inheritGlobalPaths
    } : undefined
  };
}

