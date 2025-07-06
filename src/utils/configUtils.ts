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
      paths: {
        allowedPaths: [...config.global.paths.allowedPaths],
        initialDir: config.global.paths.initialDir
      }
    },
    shells: {}
  };

  if (config.global.security.enableInjectionProtection) {
    serializable.global.restrictions = {
      blockedCommands: [...config.global.restrictions.blockedCommands],
      blockedArguments: [...config.global.restrictions.blockedArguments],
      blockedOperators: [...config.global.restrictions.blockedOperators]
    };
  }

  // Add shell configurations for enabled shells only
  for (const [shellName, shellConfig] of Object.entries(config.shells)) {
    if (!shellConfig || !shellConfig.enabled) continue;

    const shellInfo: any = {
      type: shellConfig.type
    };

    if (shellConfig.overrides) {
      if (shellConfig.overrides.security) {
        shellInfo.security = { ...shellConfig.overrides.security };
      }

      const effectiveInjection =
        shellConfig.overrides.security?.enableInjectionProtection !== undefined
          ? shellConfig.overrides.security.enableInjectionProtection
          : config.global.security.enableInjectionProtection;

      const r = shellConfig.overrides.restrictions;
      if (effectiveInjection && r && (r.blockedCommands || r.blockedArguments || r.blockedOperators)) {
        shellInfo.restrictions = {};
        if (r.blockedCommands) shellInfo.restrictions.blockedCommands = [...r.blockedCommands];
        if (r.blockedArguments) shellInfo.restrictions.blockedArguments = [...r.blockedArguments];
        if (r.blockedOperators) shellInfo.restrictions.blockedOperators = [...r.blockedOperators];
      }

      const p = shellConfig.overrides.paths;
      if (p && (p.allowedPaths || p.initialDir !== undefined)) {
        shellInfo.paths = {};
        if (p.allowedPaths) shellInfo.paths.allowedPaths = [...p.allowedPaths];
        if (p.initialDir !== undefined) shellInfo.paths.initialDir = p.initialDir;
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
    type: resolved.type,
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

