# Modular Shell Architecture - Implementation Plan

## Overview

This document provides a detailed, step-by-step implementation plan for transitioning the WCLI0 MCP server to a modular shell architecture. The plan is organized into phases, with each phase building on the previous one while maintaining backward compatibility.

**Estimated Total Time**: 6-8 weeks (depending on team size and availability)

## Table of Contents

1. [Phase 1: Foundation & Infrastructure](#phase-1-foundation--infrastructure)
2. [Phase 2: Shell Module Extraction](#phase-2-shell-module-extraction)
3. [Phase 3: Registry & Dynamic Loading](#phase-3-registry--dynamic-loading)
4. [Phase 4: Build Configuration System](#phase-4-build-configuration-system)
5. [Phase 5: Testing & Validation](#phase-5-testing--validation)
6. [Phase 6: Documentation & Migration](#phase-6-documentation--migration)
7. [Phase 7: Cleanup & Optimization](#phase-7-cleanup--optimization)

---

## Phase 1: Foundation & Infrastructure

**Duration**: 1 week
**Goal**: Set up the foundational structure for modular shells without breaking existing functionality

### Task 1.1: Create Directory Structure

```bash
mkdir -p src/shells/{base,powershell,cmd,gitbash,bash,wsl}
mkdir -p src/core
mkdir -p src/build/presets
mkdir -p docs/tasks/modular_shells
```

**Files to create:**

- `src/shells/base/` - Base shell interfaces and types
- `src/core/` - Core server functionality
- `src/build/` - Build configuration system

### Task 1.2: Define Shell Plugin Interface

**File**: `src/shells/base/ShellInterface.ts`

```typescript
import { ShellConfig } from '../../types/config';

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
```

**Tests**: `src/shells/base/__tests__/ShellInterface.test.ts`

### Task 1.3: Create Base Shell Implementation

**File**: `src/shells/base/BaseShell.ts`

```typescript
import { ShellPlugin, ValidationContext, ValidationResult } from './ShellInterface';
import { ShellConfig } from '../../types/config';

export abstract class BaseShell implements ShellPlugin {
  abstract readonly shellType: string;
  abstract readonly displayName: string;
  abstract readonly defaultConfig: ShellConfig;

  validateCommand(command: string, context: ValidationContext): ValidationResult {
    const errors: string[] = [];

    // Check blocked commands
    const blockedCommands = [
      ...this.getBlockedCommands(),
      ...(context.blockedCommands || [])
    ];

    const commandName = command.trim().split(/\s+/)[0].toLowerCase();
    if (blockedCommands.includes(commandName)) {
      errors.push(`Command '${commandName}' is blocked for ${this.shellType}`);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  validatePath(path: string, context: ValidationContext): ValidationResult {
    // Base implementation - can be overridden
    return { valid: true };
  }

  abstract getBlockedCommands(): string[];

  mergeConfig(base: ShellConfig, override: Partial<ShellConfig>): ShellConfig {
    return {
      ...base,
      ...override,
      security: {
        ...base.security,
        ...(override.security || {})
      },
      restrictions: {
        ...base.restrictions,
        ...(override.restrictions || {})
      }
    };
  }
}
```

**Tests**: `src/shells/base/__tests__/BaseShell.test.ts`

### Task 1.4: Create Shell Registry

**File**: `src/core/registry.ts`

```typescript
import { ShellPlugin } from '../shells/base/ShellInterface';

export class ShellRegistry {
  private shells: Map<string, ShellPlugin> = new Map();
  private static instance: ShellRegistry;

  private constructor() {}

  static getInstance(): ShellRegistry {
    if (!ShellRegistry.instance) {
      ShellRegistry.instance = new ShellRegistry();
    }
    return ShellRegistry.instance;
  }

  /** Register a shell plugin */
  register(shell: ShellPlugin): void {
    if (this.shells.has(shell.shellType)) {
      console.warn(`Shell ${shell.shellType} is already registered, skipping`);
      return;
    }
    console.log(`Registering shell: ${shell.shellType}`);
    this.shells.set(shell.shellType, shell);
  }

  /** Unregister a shell plugin */
  unregister(shellType: string): boolean {
    return this.shells.delete(shellType);
  }

  /** Get a registered shell by type */
  getShell(shellType: string): ShellPlugin | undefined {
    return this.shells.get(shellType);
  }

  /** Get all registered shells */
  getAllShells(): ShellPlugin[] {
    return Array.from(this.shells.values());
  }

  /** Get all registered shell types */
  getShellTypes(): string[] {
    return Array.from(this.shells.keys());
  }

  /** Check if a shell is registered */
  hasShell(shellType: string): boolean {
    return this.shells.has(shellType);
  }

  /** Get count of registered shells */
  getCount(): number {
    return this.shells.size;
  }

  /** Clear all registered shells (mainly for testing) */
  clear(): void {
    this.shells.clear();
  }
}

// Export singleton instance
export const shellRegistry = ShellRegistry.getInstance();
```

**Tests**: `src/core/__tests__/registry.test.ts`

**Deliverables**:

- [ ] Directory structure created
- [ ] ShellInterface defined and documented
- [ ] BaseShell implementation complete
- [ ] ShellRegistry implemented
- [ ] All foundation tests passing

---

## Phase 2: Shell Module Extraction

**Duration**: 2-3 weeks
**Goal**: Extract each shell implementation into its own module

### Task 2.1: Extract PowerShell Module

**File**: `src/shells/powershell/PowerShellImpl.ts`

Extract PowerShell-specific code from:

- `src/utils/config.ts` (lines 26-41 - PowerShell config)
- `src/utils/validation.ts` (PowerShell validation logic)
- `src/utils/pathValidation.ts` (Windows path handling)

```typescript
import { BaseShell } from '../base/BaseShell';
import { ShellConfig } from '../../types/config';

export class PowerShellPlugin extends BaseShell {
  readonly shellType = 'powershell';
  readonly displayName = 'PowerShell';
  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: 'powershell.exe',
    shellArgs: ['-NoProfile', '-Command'],
    timeout: 30000,
    maxOutputLines: 1000,
    security: {
      allowCommandChaining: false,
      allowPipeOperators: true,
      allowRedirection: false,
      validatePaths: true,
    },
    restrictions: {
      allowedCommands: [],
      blockedCommands: ['Invoke-WebRequest', 'Invoke-RestMethod', 'Start-Process'],
      allowedPaths: [],
      blockedPaths: [],
      requirePathValidation: true,
    },
    paths: {
      enforceAbsolutePaths: false,
      pathStyle: 'windows',
    },
  };

  getBlockedCommands(): string[] {
    return [
      'Invoke-WebRequest',
      'Invoke-RestMethod',
      'Start-Process',
      'New-Object',
      'Invoke-Expression',
      'iex',
      'wget',
      'curl'
    ];
  }

  validatePath(path: string): { valid: boolean; errors?: string[] } {
    // Windows path validation
    const windowsPathRegex = /^[A-Za-z]:[/\\]|^\\\\|^\./;
    if (!windowsPathRegex.test(path)) {
      return {
        valid: false,
        errors: [`Invalid Windows path format: ${path}`]
      };
    }
    return { valid: true };
  }
}
```

**File**: `src/shells/powershell/index.ts`

```typescript
export { PowerShellPlugin } from './PowerShellImpl';
export type { ShellPlugin } from '../base/ShellInterface';
```

**Tests**: `src/shells/powershell/__tests__/PowerShellImpl.test.ts`

### Task 2.2: Extract CMD Module

**File**: `src/shells/cmd/CmdImpl.ts`

Extract CMD-specific code from:

- `src/utils/config.ts` (lines 42-57 - CMD config)
- CMD-specific validation logic

```typescript
import { BaseShell } from '../base/BaseShell';
import { ShellConfig } from '../../types/config';

export class CmdPlugin extends BaseShell {
  readonly shellType = 'cmd';
  readonly displayName = 'Command Prompt (CMD)';
  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: 'cmd.exe',
    shellArgs: ['/C'],
    timeout: 30000,
    maxOutputLines: 1000,
    security: {
      allowCommandChaining: false,
      allowPipeOperators: true,
      allowRedirection: false,
      validatePaths: true,
    },
    restrictions: {
      allowedCommands: [],
      blockedCommands: ['del', 'rd', 'rmdir', 'format'],
      allowedPaths: [],
      blockedPaths: [],
      requirePathValidation: true,
    },
    paths: {
      enforceAbsolutePaths: false,
      pathStyle: 'windows',
    },
  };

  getBlockedCommands(): string[] {
    return [
      'del', 'erase',
      'rd', 'rmdir',
      'format',
      'diskpart',
      'reg delete'
    ];
  }

  validatePath(path: string): { valid: boolean; errors?: string[] } {
    // Windows path validation (same as PowerShell)
    const windowsPathRegex = /^[A-Za-z]:[/\\]|^\\\\|^\./;
    if (!windowsPathRegex.test(path)) {
      return {
        valid: false,
        errors: [`Invalid Windows path format: ${path}`]
      };
    }
    return { valid: true };
  }
}
```

**File**: `src/shells/cmd/index.ts`

**Tests**: `src/shells/cmd/__tests__/CmdImpl.test.ts`

### Task 2.3: Extract Git Bash Module

**File**: `src/shells/gitbash/GitBashImpl.ts`

Extract Git Bash-specific code:

- `src/utils/config.ts` (lines 58-73 - Git Bash config)
- Git Bash path handling (mixed Windows/Unix paths)
- Git Bash validation logic

```typescript
import { BaseShell } from '../base/BaseShell';
import { ShellConfig } from '../../types/config';

export class GitBashPlugin extends BaseShell {
  readonly shellType = 'gitbash';
  readonly displayName = 'Git Bash';
  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: 'C:\\Program Files\\Git\\bin\\bash.exe',
    shellArgs: ['-c'],
    timeout: 30000,
    maxOutputLines: 1000,
    security: {
      allowCommandChaining: true,
      allowPipeOperators: true,
      allowRedirection: true,
      validatePaths: true,
    },
    restrictions: {
      allowedCommands: [],
      blockedCommands: ['rm -rf /', 'mkfs', 'dd'],
      allowedPaths: [],
      blockedPaths: [],
      requirePathValidation: false,
    },
    paths: {
      enforceAbsolutePaths: false,
      pathStyle: 'unix',
    },
  };

  getBlockedCommands(): string[] {
    return [
      'rm -rf /',
      'mkfs',
      'dd',
      'wget',
      'curl'
    ];
  }

  validatePath(path: string): { valid: boolean; errors?: string[] } {
    // Git Bash supports both Unix-style (/c/path) and Windows-style (C:\path)
    const gitBashPathRegex = /^\/[a-z]\/|^[A-Za-z]:[/\\]|^\.\.?\/|^\//;
    if (!gitBashPathRegex.test(path)) {
      return {
        valid: false,
        errors: [`Invalid Git Bash path format: ${path}`]
      };
    }
    return { valid: true };
  }
}
```

**File**: `src/shells/gitbash/index.ts`

**Tests**: `src/shells/gitbash/__tests__/GitBashImpl.test.ts`

### Task 2.4: Extract Bash Module

**File**: `src/shells/bash/BashImpl.ts`

Extract Bash/WSL-specific code:

- `src/utils/config.ts` (lines 74-89 - Bash config)
- Unix path validation

```typescript
import { BaseShell } from '../base/BaseShell';
import { ShellConfig } from '../../types/config';

export class BashPlugin extends BaseShell {
  readonly shellType = 'bash';
  readonly displayName = 'Bash';
  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: '/bin/bash',
    shellArgs: ['-c'],
    timeout: 30000,
    maxOutputLines: 1000,
    security: {
      allowCommandChaining: true,
      allowPipeOperators: true,
      allowRedirection: true,
      validatePaths: true,
    },
    restrictions: {
      allowedCommands: [],
      blockedCommands: ['rm -rf /', 'mkfs', 'dd'],
      allowedPaths: [],
      blockedPaths: [],
      requirePathValidation: false,
    },
    paths: {
      enforceAbsolutePaths: false,
      pathStyle: 'unix',
    },
  };

  getBlockedCommands(): string[] {
    return [
      'rm -rf /',
      'mkfs',
      'dd',
      'fdisk',
      'wget',
      'curl'
    ];
  }

  validatePath(path: string): { valid: boolean; errors?: string[] } {
    // Unix path validation
    const unixPathRegex = /^\/|^\.\.?\//;
    if (!unixPathRegex.test(path)) {
      return {
        valid: false,
        errors: [`Invalid Unix path format: ${path}`]
      };
    }
    return { valid: true };
  }
}
```

**File**: `src/shells/bash/index.ts`

**Tests**: `src/shells/bash/__tests__/BashImpl.test.ts`

### Task 2.5: Extract WSL Module

**File**: `src/shells/wsl/WslImpl.ts`

Extract WSL-specific code:

- `src/utils/config.ts` (lines 90-118 - WSL config)
- WSL path handling

```typescript
import { BaseShell } from '../base/BaseShell';
import { ShellConfig } from '../../types/config';

export class WslPlugin extends BaseShell {
  readonly shellType = 'wsl';
  readonly displayName = 'WSL (Windows Subsystem for Linux)';
  readonly defaultConfig: ShellConfig = {
    enabled: true,
    shellCommand: 'wsl.exe',
    shellArgs: ['-e', 'bash', '-c'],
    timeout: 30000,
    maxOutputLines: 1000,
    security: {
      allowCommandChaining: true,
      allowPipeOperators: true,
      allowRedirection: true,
      validatePaths: true,
    },
    restrictions: {
      allowedCommands: [],
      blockedCommands: ['rm -rf /', 'mkfs', 'dd'],
      allowedPaths: [],
      blockedPaths: [],
      requirePathValidation: false,
    },
    paths: {
      enforceAbsolutePaths: false,
      pathStyle: 'unix',
      wslMountPoint: '/mnt',
    },
  };

  getBlockedCommands(): string[] {
    return [
      'rm -rf /',
      'mkfs',
      'dd',
      'fdisk'
    ];
  }

  validatePath(path: string): { valid: boolean; errors?: string[] } {
    // WSL uses Unix paths with /mnt/ prefix for Windows drives
    const wslPathRegex = /^\/mnt\/[a-z]\/|^\/|^\.\.?\//;
    if (!wslPathRegex.test(path)) {
      return {
        valid: false,
        errors: [`Invalid WSL path format: ${path}`]
      };
    }
    return { valid: true };
  }
}
```

**File**: `src/shells/wsl/index.ts`

**Tests**: `src/shells/wsl/__tests__/WslImpl.test.ts`

**Deliverables**:

- [ ] All 5 shell modules extracted
- [ ] Each module has complete implementation
- [ ] All module tests passing
- [ ] Documentation for each module

---

## Phase 3: Registry & Dynamic Loading

**Duration**: 1 week
**Goal**: Implement dynamic shell registration and loading

### Task 3.1: Create Shell Loader

**File**: `src/shells/loader.ts`

```typescript
import { shellRegistry } from '../core/registry';
import { ShellPlugin } from './base/ShellInterface';

export interface LoaderConfig {
  shells: string[];
  verbose?: boolean;
}

export async function loadShells(config: LoaderConfig): Promise<void> {
  const { shells, verbose = false } = config;

  for (const shellType of shells) {
    try {
      if (verbose) {
        console.log(`Loading shell: ${shellType}`);
      }

      let plugin: ShellPlugin | null = null;

      switch (shellType) {
        case 'powershell': {
          const { PowerShellPlugin } = await import('./powershell');
          plugin = new PowerShellPlugin();
          break;
        }
        case 'cmd': {
          const { CmdPlugin } = await import('./cmd');
          plugin = new CmdPlugin();
          break;
        }
        case 'gitbash': {
          const { GitBashPlugin } = await import('./gitbash');
          plugin = new GitBashPlugin();
          break;
        }
        case 'bash': {
          const { BashPlugin } = await import('./bash');
          plugin = new BashPlugin();
          break;
        }
        case 'wsl': {
          const { WslPlugin } = await import('./wsl');
          plugin = new WslPlugin();
          break;
        }
        default:
          console.warn(`Unknown shell type: ${shellType}`);
      }

      if (plugin) {
        shellRegistry.register(plugin);
        if (verbose) {
          console.log(`✓ Loaded shell: ${plugin.displayName}`);
        }
      }
    } catch (error) {
      console.error(`Failed to load shell ${shellType}:`, error);
    }
  }

  if (verbose) {
    console.log(`Loaded ${shellRegistry.getCount()} shell(s)`);
  }
}
```

**Tests**: `src/shells/__tests__/loader.test.ts`

### Task 3.2: Update Main Entry Point

**File**: `src/index.ts` (modifications)

```typescript
import { shellRegistry } from './core/registry';
import { loadShells } from './shells/loader';
import { getBuildConfig } from './build/shell-config';

// Load shells based on build configuration
async function initializeShells() {
  const buildConfig = getBuildConfig();

  await loadShells({
    shells: buildConfig.includedShells,
    verbose: process.env.DEBUG === 'true'
  });

  console.log(`MCP Server initialized with ${shellRegistry.getCount()} shell(s):`);
  console.log(shellRegistry.getShellTypes().join(', '));
}

// Call during server startup
await initializeShells();
```

### Task 3.3: Update Tool Schema Generation

**File**: `src/utils/toolSchemas.ts` (modifications)

```typescript
import { shellRegistry } from '../core/registry';

export function generateToolSchemas() {
  const availableShells = shellRegistry.getShellTypes();

  return {
    execute_shell_command: {
      // ... existing schema
      properties: {
        shellType: {
          type: 'string',
          enum: availableShells, // Dynamic based on loaded shells
          description: 'Type of shell to use'
        },
        // ... other properties
      }
    }
  };
}
```

**Deliverables**:

- [ ] Shell loader implemented
- [ ] Main entry point updated
- [ ] Tool schemas use dynamic shell list
- [ ] All integration tests passing

---

## Phase 4: Build Configuration System

**Duration**: 1 week
**Goal**: Implement build-time configuration and presets

### Task 4.1: Create Build Configuration

**File**: `src/build/shell-config.ts`

```typescript
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

export function getBuildConfig(): BuildConfig {
  // Check for preset first
  const preset = process.env.SHELL_BUILD_PRESET;
  if (preset) {
    try {
      const presetModule = require(`./presets/${preset}`);
      return presetModule.default;
    } catch (error) {
      console.warn(`Preset '${preset}' not found, using default`);
    }
  }

  // Check for custom shell list
  const shellsEnv = process.env.INCLUDED_SHELLS;
  if (shellsEnv) {
    return {
      includedShells: shellsEnv.split(',').map(s => s.trim()),
      buildName: 'custom',
      verbose: process.env.BUILD_VERBOSE === 'true'
    };
  }

  // Default: include all shells
  return {
    includedShells: ['powershell', 'cmd', 'gitbash', 'bash', 'wsl'],
    buildName: 'full',
    includeAll: true
  };
}
```

### Task 4.2: Create Build Presets

**File**: `src/build/presets/full.ts`

```typescript
import { BuildConfig } from '../shell-config';

const config: BuildConfig = {
  buildName: 'full',
  includeAll: true,
  includedShells: ['powershell', 'cmd', 'gitbash', 'bash', 'wsl']
};

export default config;
```

**File**: `src/build/presets/windows.ts`

```typescript
import { BuildConfig } from '../shell-config';

const config: BuildConfig = {
  buildName: 'windows',
  includedShells: ['powershell', 'cmd', 'gitbash']
};

export default config;
```

**File**: `src/build/presets/unix.ts`

```typescript
import { BuildConfig } from '../shell-config';

const config: BuildConfig = {
  buildName: 'unix',
  includedShells: ['bash']
};

export default config;
```

**File**: `src/build/presets/gitbash-only.ts`

```typescript
import { BuildConfig } from '../shell-config';

const config: BuildConfig = {
  buildName: 'gitbash-only',
  includedShells: ['gitbash']
};

export default config;
```

**File**: `src/build/presets/cmd-only.ts`

```typescript
import { BuildConfig } from '../shell-config';

const config: BuildConfig = {
  buildName: 'cmd-only',
  includedShells: ['cmd']
};

export default config;
```

### Task 4.3: Update package.json Build Scripts

**File**: `package.json`

```json
{
  "scripts": {
    "build": "npm run build:full",
    "build:full": "SHELL_BUILD_PRESET=full npm run compile",
    "build:windows": "SHELL_BUILD_PRESET=windows npm run compile",
    "build:unix": "SHELL_BUILD_PRESET=unix npm run compile",
    "build:gitbash": "SHELL_BUILD_PRESET=gitbash-only npm run compile",
    "build:cmd": "SHELL_BUILD_PRESET=cmd-only npm run compile",
    "build:custom": "npm run compile",
    "compile": "tsc && rollup -c"
  }
}
```

### Task 4.4: Configure Rollup for Tree-Shaking

**File**: `rollup.config.js`

```javascript
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { getBuildConfig } from './src/build/shell-config';

const buildConfig = getBuildConfig();

export default {
  input: 'src/index.ts',
  output: {
    file: `dist/index.${buildConfig.buildName}.js`,
    format: 'cjs',
    sourcemap: true
  },
  plugins: [
    typescript(),
    nodeResolve(),
    commonjs(),
  ],
  external: ['child_process', 'fs', 'path'],
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    unknownGlobalSideEffects: false
  }
};
```

**Deliverables**:

- [ ] Build configuration system complete
- [ ] All presets created
- [ ] Build scripts added to package.json
- [ ] Rollup configured for tree-shaking
- [ ] Successful builds for all presets

---

## Phase 5: Testing & Validation

**Duration**: 1-2 weeks
**Goal**: Comprehensive testing of modular architecture

### Task 5.1: Unit Tests for Each Shell Module

Create comprehensive tests for each shell:

**Example**: `src/shells/gitbash/__tests__/GitBashImpl.test.ts`

```typescript
import { GitBashPlugin } from '../GitBashImpl';

describe('GitBashPlugin', () => {
  let plugin: GitBashPlugin;

  beforeEach(() => {
    plugin = new GitBashPlugin();
  });

  describe('configuration', () => {
    it('should have correct shell type', () => {
      expect(plugin.shellType).toBe('gitbash');
    });

    it('should have display name', () => {
      expect(plugin.displayName).toBe('Git Bash');
    });

    it('should have default config', () => {
      expect(plugin.defaultConfig).toBeDefined();
      expect(plugin.defaultConfig.enabled).toBe(true);
    });
  });

  describe('validatePath', () => {
    it('should accept Unix-style paths', () => {
      const result = plugin.validatePath('/c/Users/test');
      expect(result.valid).toBe(true);
    });

    it('should accept Windows-style paths', () => {
      const result = plugin.validatePath('C:\\Users\\test');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid paths', () => {
      const result = plugin.validatePath('invalid:path');
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('getBlockedCommands', () => {
    it('should return blocked commands list', () => {
      const blocked = plugin.getBlockedCommands();
      expect(blocked).toContain('rm -rf /');
      expect(blocked.length).toBeGreaterThan(0);
    });
  });
});
```

Repeat for all 5 shells.

### Task 5.2: Integration Tests

**File**: `src/__tests__/integration/modular-shells.test.ts`

```typescript
import { shellRegistry } from '../../core/registry';
import { loadShells } from '../../shells/loader';

describe('Modular Shell Integration', () => {
  beforeEach(() => {
    shellRegistry.clear();
  });

  it('should load only specified shells', async () => {
    await loadShells({
      shells: ['gitbash', 'powershell']
    });

    expect(shellRegistry.getCount()).toBe(2);
    expect(shellRegistry.hasShell('gitbash')).toBe(true);
    expect(shellRegistry.hasShell('powershell')).toBe(true);
    expect(shellRegistry.hasShell('cmd')).toBe(false);
  });

  it('should handle empty shell list', async () => {
    await loadShells({ shells: [] });
    expect(shellRegistry.getCount()).toBe(0);
  });

  it('should handle invalid shell types gracefully', async () => {
    await loadShells({
      shells: ['gitbash', 'invalid-shell']
    });

    expect(shellRegistry.getCount()).toBe(1);
    expect(shellRegistry.hasShell('gitbash')).toBe(true);
  });
});
```

### Task 5.3: Build Tests

**File**: `scripts/test-builds.sh`

```bash
#!/bin/bash

set -e

echo "Testing all build configurations..."

# Test full build
echo "Building: full"
npm run build:full
ls -lh dist/index.full.js

# Test windows build
echo "Building: windows"
npm run build:windows
ls -lh dist/index.windows.js

# Test unix build
echo "Building: unix"
npm run build:unix
ls -lh dist/index.unix.js

# Test gitbash build
echo "Building: gitbash-only"
npm run build:gitbash
ls -lh dist/index.gitbash-only.js

# Test cmd build
echo "Building: cmd-only"
npm run build:cmd
ls -lh dist/index.cmd-only.js

# Compare sizes
echo ""
echo "Build size comparison:"
ls -lh dist/*.js | awk '{print $9, $5}'

echo ""
echo "All builds completed successfully!"
```

### Task 5.4: Regression Tests

Ensure all existing tests still pass:

```bash
npm run test
npm run test:integration
npm run test:e2e
```

**Deliverables**:

- [ ] Unit tests for all shell modules (100% coverage)
- [ ] Integration tests passing
- [ ] Build tests for all presets
- [ ] Regression tests passing
- [ ] Performance benchmarks documented

---

## Phase 6: Documentation & Migration

**Duration**: 1 week
**Goal**: Complete documentation and migration guide

### Task 6.1: API Documentation

**File**: `docs/tasks/modular_shells/API.md`

Document:

- ShellPlugin interface
- Shell registry API
- Build configuration options
- How to add new shells

### Task 6.2: User Guide

**File**: `docs/tasks/modular_shells/USER_GUIDE.md`

Document:

- How to build for specific shells
- Available presets
- Custom build configurations
- Environment variables

### Task 6.3: Migration Guide

**File**: `docs/tasks/modular_shells/MIGRATION_GUIDE.md`

Document:

- Breaking changes (if any)
- How to migrate existing configurations
- Compatibility notes
- Troubleshooting

### Task 6.4: Update Main README

Update main README.md with:

- New build options
- Link to modular shells documentation
- Quick start for different builds

**Deliverables**:

- [ ] Complete API documentation
- [ ] User guide with examples
- [ ] Migration guide
- [ ] Updated README
- [ ] Example configurations

---

## Phase 7: Cleanup & Optimization

**Duration**: 1 week
**Goal**: Remove old code and optimize

### Task 7.1: Remove Deprecated Code

Identify and remove:

- Old monolithic shell configuration
- Unused validation functions
- Deprecated imports

### Task 7.2: Optimize Bundle Sizes

- Analyze bundle sizes for each preset
- Optimize imports
- Remove dead code
- Minimize dependencies

### Task 7.3: Performance Testing

- Measure startup time for each build
- Compare memory usage
- Benchmark command execution

### Task 7.4: Final Review

- Code review of all changes
- Security audit
- Performance review
- Documentation review

**Deliverables**:

- [ ] Old code removed
- [ ] Bundle sizes optimized
- [ ] Performance metrics documented
- [ ] Final code review complete
- [ ] Ready for production

---

## Success Metrics

### Bundle Size Targets

| Build | Target Size | Max Size | Expected Reduction |
|-------|-------------|----------|-------------------|
| Full | Baseline | 100% | - |
| Windows | 50-65% | 70% | 30-50% |
| Unix | 35-45% | 50% | 50-65% |
| Git Bash Only | 35-45% | 50% | 50-65% |
| CMD Only | 30-40% | 45% | 55-70% |

### Performance Targets

| Metric | Full Build | Single Shell | Improvement |
|--------|-----------|--------------|-------------|
| Startup Time | Baseline | -20-30% | 20-30% faster |
| Memory Usage | Baseline | -30-40% | 30-40% less |
| Type Check Time | Baseline | -15-25% | 15-25% faster |

### Code Quality Targets

- Test Coverage: ≥ 90%
- Type Safety: 100% (strict mode)
- Documentation: All public APIs documented
- Zero regressions in existing functionality

---

## Risk Management

### Identified Risks

1. **Breaking Changes**
   - Mitigation: Maintain backward compatibility, provide migration guide
   - Contingency: Feature flag for old behavior

2. **Bundle Size Not Reducing**
   - Mitigation: Test tree-shaking early, optimize imports
   - Contingency: Manual code splitting if needed

3. **Type Safety Issues**
   - Mitigation: Strict TypeScript config, comprehensive tests
   - Contingency: Runtime type checking where needed

4. **Performance Regression**
   - Mitigation: Benchmark each phase, early performance testing
   - Contingency: Rollback problematic changes

5. **Test Coverage Gaps**
   - Mitigation: Write tests alongside implementation
   - Contingency: Dedicated testing sprint

---

## Timeline Summary

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Foundation | 1 week | None |
| Phase 2: Extraction | 2-3 weeks | Phase 1 |
| Phase 3: Registry | 1 week | Phases 1-2 |
| Phase 4: Build Config | 1 week | Phases 1-3 |
| Phase 5: Testing | 1-2 weeks | Phases 1-4 |
| Phase 6: Documentation | 1 week | Phases 1-5 |
| Phase 7: Cleanup | 1 week | Phases 1-6 |

**Total Duration**: 8-10 weeks

---

## Next Steps

1. Review and approve this implementation plan
2. Set up project tracking (GitHub issues/project board)
3. Assign team members to phases
4. Begin Phase 1: Foundation & Infrastructure
5. Schedule regular check-ins and reviews

## Conclusion

This implementation plan provides a structured approach to transitioning WCLI0 to a modular shell architecture. Each phase builds on the previous one while maintaining backward compatibility and ensuring quality through comprehensive testing. The result will be a more maintainable, flexible, and efficient codebase that better serves users with specific shell requirements.
