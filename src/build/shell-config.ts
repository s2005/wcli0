export interface BuildConfig {
  /** Shells to include in this build */
  includedShells: string[];

  /** Build name/identifier */
  buildName: string;

  /** Whether to include all shells (overrides includedShells) */
  includeAll?: boolean;

  /** Whether to log debug info during build */
  verbose?: boolean;
}

/**
 * Predefined build presets
 */
const PRESETS: Record<string, BuildConfig> = {
  full: {
    buildName: 'full',
    includeAll: true,
    includedShells: ['powershell', 'cmd', 'gitbash', 'bash', 'wsl'],
  },
  windows: {
    buildName: 'windows',
    includedShells: ['powershell', 'cmd', 'gitbash'],
  },
  unix: {
    buildName: 'unix',
    includedShells: ['bash'],
  },
  'gitbash-only': {
    buildName: 'gitbash-only',
    includedShells: ['gitbash'],
  },
  'cmd-only': {
    buildName: 'cmd-only',
    includedShells: ['cmd'],
  },
  'powershell-only': {
    buildName: 'powershell-only',
    includedShells: ['powershell'],
  },
};

/**
 * Get a preset configuration by name
 */
function getPresetConfig(presetName: string): BuildConfig | null {
  return PRESETS[presetName] || null;
}

/**
 * Get build configuration for shell loading
 *
 * Configuration is determined by environment variables in this order:
 * 1. SHELL_BUILD_PRESET - Use a preset name (maps to predefined configs)
 * 2. INCLUDED_SHELLS - Comma-separated list of shells (e.g., 'gitbash,powershell')
 * 3. Default - Include all shells
 *
 * @returns Build configuration specifying which shells to load
 */
export function getBuildConfig(): BuildConfig {
  const verbose = process.env.BUILD_VERBOSE === 'true';

  // Check for preset first
  const preset = process.env.SHELL_BUILD_PRESET;
  if (preset) {
    const presetConfig = getPresetConfig(preset);
    if (presetConfig) {
      return {
        ...presetConfig,
        verbose,
      };
    }
    console.warn(`Unknown preset '${preset}', using default`);
  }

  // Check for custom shell list
  const shellsEnv = process.env.INCLUDED_SHELLS;
  if (shellsEnv) {
    return {
      includedShells: shellsEnv.split(',').map((s) => s.trim()),
      buildName: 'custom',
      verbose,
    };
  }

  // Default: include all shells
  return {
    includedShells: ['powershell', 'cmd', 'gitbash', 'bash', 'wsl'],
    buildName: 'full',
    includeAll: true,
    verbose,
  };
}
