import type {
  GlobalConfig,
  ShellOverrides,
  ResolvedShellConfig,
  BaseShellConfig,
  WslShellConfig,
  GlobalSecurityConfig,
  GlobalRestrictionsConfig,
  GlobalPathsConfig
} from '../types/config.js';
import { isWslShellConfig } from './configTypes.js';

/**
 * Deep merge two objects, with source overriding target
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] === undefined) continue;
    
    if (typeof source[key] === 'object' && 
        source[key] !== null && 
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        target[key] !== null &&
        !Array.isArray(target[key])) {
      // Recursively merge objects
      result[key] = deepMerge(target[key] as any, source[key] as any);
    } else {
      // Direct assignment for primitives and arrays
      result[key] = source[key] as any;
    }
  }
  
  return result;
}

/**
 * Merge arrays based on strategy
 */
export type ArrayMergeStrategy = 'replace' | 'append' | 'prepend' | 'union';

function mergeArrays<T>(target: T[], source: T[], strategy: ArrayMergeStrategy): T[] {
  switch (strategy) {
    case 'replace':
      return [...source];
    case 'append':
      return [...target, ...source];
    case 'prepend':
      return [...source, ...target];
    case 'union':
      return Array.from(new Set([...target, ...source]));
    default:
      return source;
  }
}

/**
 * Merge restrictions with specific strategies
 */
function mergeRestrictions(
  global: GlobalRestrictionsConfig,
  overrides: Partial<GlobalRestrictionsConfig>
): GlobalRestrictionsConfig {
  return {
    blockedCommands: overrides.blockedCommands !== undefined
      ? mergeArrays(global.blockedCommands, overrides.blockedCommands, 'append')
      : global.blockedCommands,
    blockedArguments: overrides.blockedArguments !== undefined
      ? mergeArrays(global.blockedArguments, overrides.blockedArguments, 'append')
      : global.blockedArguments,
    blockedOperators: overrides.blockedOperators !== undefined
      ? overrides.blockedOperators // Replace for operators
      : global.blockedOperators
  };
}

/**
 * Merge path configurations
 */
function mergePaths(
  global: GlobalPathsConfig,
  overrides: Partial<GlobalPathsConfig>
): GlobalPathsConfig {
  return {
    allowedPaths: overrides.allowedPaths !== undefined
      ? overrides.allowedPaths // Replace paths entirely for shell-specific needs
      : global.allowedPaths,
    initialDir: overrides.initialDir !== undefined
      ? overrides.initialDir
      : global.initialDir
  };
}

/**
 * Resolve final configuration for a shell by merging global and overrides
 */
export function resolveShellConfiguration(
  global: GlobalConfig,
  shell: BaseShellConfig | WslShellConfig
): ResolvedShellConfig {
  const overrides = shell.overrides || {};
  
  const resolved: ResolvedShellConfig = {
    enabled: shell.enabled,
    executable: shell.executable,
    security: overrides.security 
      ? deepMerge(global.security, overrides.security)
      : global.security,
    restrictions: overrides.restrictions
      ? mergeRestrictions(global.restrictions, overrides.restrictions)
      : global.restrictions,
    paths: overrides.paths
      ? mergePaths(global.paths, overrides.paths)
      : global.paths,
    validatePath: shell.validatePath
  };

  // Add WSL config if present
  if (isWslShellConfig(shell)) {
    resolved.wslConfig = shell.wslConfig;
  }

  return resolved;
}

/**
 * Apply WSL path inheritance if configured
 */
export function applyWslPathInheritance(
  resolved: ResolvedShellConfig,
  globalPaths: string[]
): ResolvedShellConfig {
  if (!resolved.wslConfig || !resolved.wslConfig.inheritGlobalPaths) {
    return resolved;
  }

  const mountPoint = resolved.wslConfig.mountPoint || '/mnt/';
  const convertedPaths: string[] = [];

  // Convert Windows paths to WSL format
  for (const path of globalPaths) {
    if (path.match(/^[A-Z]:\\/i)) {
      const drive = path[0].toLowerCase();
      const rest = path.substring(2).replace(/\\/g, '/');
      convertedPaths.push(`${mountPoint}${drive}${rest}`);
    }
  }

  // Merge with existing WSL paths (union to avoid duplicates)
  resolved.paths.allowedPaths = Array.from(new Set([
    ...resolved.paths.allowedPaths,
    ...convertedPaths
  ]));

  return resolved;
}
