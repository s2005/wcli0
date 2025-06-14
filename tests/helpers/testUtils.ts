import { DEFAULT_CONFIG } from '../../src/utils/config.js';
import path from 'path';
import type { 
  ServerConfig, 
  GlobalConfig,
  BaseShellConfig, 
  WslShellConfig,
  ShellOverrides 
} from '../../src/types/config.js';

/**
 * Build a test configuration with the new structure
 */
export function buildTestConfig(overrides: DeepPartial<ServerConfig> = {}): ServerConfig {
  const config: ServerConfig = {
    global: {
      security: {
        maxCommandLength: 2000,
        commandTimeout: 30,
        enableInjectionProtection: true,
        restrictWorkingDirectory: true,
        ...overrides.global?.security
      },
      restrictions: {
        blockedCommands: overrides.global?.restrictions?.blockedCommands?.filter((cmd): cmd is string => cmd !== undefined) ?? ['format', 'shutdown'],
        blockedArguments: overrides.global?.restrictions?.blockedArguments?.filter((arg): arg is string => arg !== undefined) ?? ['--system'],
        blockedOperators: overrides.global?.restrictions?.blockedOperators?.filter((op): op is string => op !== undefined) ?? ['&', '|', ';', '`'],
      },
      paths: {
        allowedPaths: overrides.global?.paths?.allowedPaths?.filter((path): path is string => path !== undefined) ?? ['/test/default'],
        initialDir: overrides.global?.paths?.initialDir,
      }
    },
    shells: {}
  };
  
  // Apply shell overrides with proper typing
  if (overrides.shells) {
    const shells = overrides.shells;
    Object.entries(shells).forEach(([key, shellConfig]) => {
      if (shellConfig) {
        (config.shells as any)[key] = shellConfig;
      }
    });
  }

  return config;
}

/**
 * Build a minimal shell configuration for testing
 */
export function buildShellConfig(
  shellType: 'base' | 'wsl' = 'base',
  overrides: Partial<BaseShellConfig | WslShellConfig> = {}
): BaseShellConfig | WslShellConfig {
  const base: BaseShellConfig = {
    enabled: true,
    executable: {
      command: 'test.exe',
      args: ['/c'],
      ...overrides.executable
    },
    overrides: overrides.overrides,
    validatePath: overrides.validatePath
  };

  if (shellType === 'wsl' && 'wslConfig' in overrides) {
    return {
      ...base,
      wslConfig: overrides.wslConfig
    } as WslShellConfig;
  }

  return base;
}

/**
 * Create WSL emulator configuration for tests
 */
export function createWslEmulatorConfig(overrides: Partial<WslShellConfig> = {}): WslShellConfig {
  const wslEmulatorPath = path.resolve(process.cwd(), 'scripts/wsl-emulator.js');
  
  return {
    enabled: true,
    executable: {
      command: 'node',
      args: [wslEmulatorPath, '-e']
    },
    wslConfig: {
      mountPoint: '/mnt/',
      inheritGlobalPaths: true,
      pathMapping: {
        enabled: true,
        windowsToWsl: true
      }
    },
    ...overrides
  };
}

/**
 * Helper type for deep partial
 */
type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;
