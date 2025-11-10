# Modular Shell Architecture

## Executive Summary

This document outlines a modular architecture for the WCLI0 MCP server that enables build-time inclusion/exclusion of shell implementations. This allows creating specialized builds that only include the shells needed by specific users (e.g., Git Bash-only or CMD-only builds), resulting in smaller bundle sizes, reduced complexity, and easier maintenance.

## Current State Analysis

### Existing Architecture

The current implementation is already configuration-driven with strong separation of concerns:

**Supported Shells:**

- PowerShell (Windows)
- CMD (Windows)
- Git Bash (Windows/Unix hybrid)
- Bash (WSL/Unix)
- WSL (Windows Subsystem for Linux)

**Key Architectural Elements:**

- **Configuration-driven**: All shells defined in `DEFAULT_CONFIG` (src/utils/config.ts:26-118)
- **Type-safe**: Strong TypeScript typing throughout
- **Dynamic registration**: Only enabled shells appear in MCP tools
- **Context-based validation**: Shell type determines validation rules
- **Layered configuration**: Global defaults + shell overrides + CLI args

**Core Components:**

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Server & Execution | src/index.ts | Main server logic, tool execution |
| Type Definitions | src/types/config.ts | TypeScript interfaces and types |
| Configuration | src/utils/config.ts | Shell configuration and defaults |
| Config Merging | src/utils/configMerger.ts | Configuration merge logic |
| Validation Context | src/utils/validationContext.ts | Shell type classification |
| Path Validation | src/utils/pathValidation.ts | Path handling per shell |
| Command Validation | src/utils/validation.ts | Command validation rules |
| Tool Schemas | src/utils/toolSchemas.ts | Dynamic tool schema generation |
| Tool Descriptions | src/utils/toolDescription.ts | Tool documentation |

### Current Limitations

While the architecture is modular at the configuration level, it has these limitations for specialized deployments:

1. **No Build-Time Exclusion**: All shell code is bundled even if only one shell is needed
2. **Bundle Size**: Users who only need Git Bash still get PowerShell, CMD, WSL, and Bash code
3. **Maintenance Complexity**: Changes to unused shells still affect the codebase
4. **Type Safety**: ShellType union includes all shells regardless of what's needed
5. **Testing Overhead**: All shells must be tested even for specialized builds

## Goals and Objectives

### Primary Goals

1. **Build-Time Modularity**: Enable including/excluding shells at build time via configuration
2. **Code Elimination**: Allow tree-shaking to remove unused shell implementations
3. **Type Safety**: Maintain TypeScript type safety for included shells only
4. **Backward Compatibility**: Keep existing full-featured builds working
5. **Developer Experience**: Make it easy to create specialized builds

### Benefits

**For End Users:**

- Smaller bundle sizes (potentially 30-50% reduction for single-shell builds)
- Faster startup times
- Reduced memory footprint
- Simpler configuration (no unused shell options)

**For Developers:**

- Clearer separation of concerns
- Easier testing of specific shells
- Ability to deprecate shells without breaking existing deployments
- Better code organization

**For Maintenance:**

- Isolated shell implementations
- Easier to add new shells
- Reduced coupling between shells
- Clearer dependency graphs

## Proposed Modular Architecture

### Design Principles

1. **Plugin-Based Architecture**: Each shell is a self-contained module/plugin
2. **Build Configuration**: Use environment variables or build config to select shells
3. **Dynamic Registration**: Shells register themselves with the core system
4. **Interface-Driven**: All shells implement a common interface
5. **Zero Runtime Overhead**: Excluded shells have zero runtime footprint

### Module Structure

```text
src/
├── core/                          # Core functionality (always included)
│   ├── server.ts                  # MCP server implementation
│   ├── executor.ts                # Command execution engine
│   ├── types.ts                   # Core type definitions
│   └── registry.ts                # Shell registry system
│
├── shells/                        # Shell implementations (modular)
│   ├── index.ts                   # Shell module exports (build-aware)
│   ├── base/                      # Base shell functionality
│   │   ├── ShellInterface.ts      # Shell plugin interface
│   │   ├── BaseShell.ts           # Base implementation
│   │   └── types.ts               # Shared types
│   │
│   ├── powershell/                # PowerShell module
│   │   ├── index.ts               # Module entry point
│   │   ├── PowerShellImpl.ts      # Implementation
│   │   ├── config.ts              # Default configuration
│   │   ├── validator.ts           # PowerShell-specific validation
│   │   ├── pathHandler.ts         # Path handling
│   │   └── __tests__/             # Shell-specific tests
│   │
│   ├── cmd/                       # CMD module
│   │   ├── index.ts
│   │   ├── CmdImpl.ts
│   │   ├── config.ts
│   │   ├── validator.ts
│   │   ├── pathHandler.ts
│   │   └── __tests__/
│   │
│   ├── gitbash/                   # Git Bash module
│   │   ├── index.ts
│   │   ├── GitBashImpl.ts
│   │   ├── config.ts
│   │   ├── validator.ts
│   │   ├── pathHandler.ts
│   │   └── __tests__/
│   │
│   ├── bash/                      # Bash/WSL module
│   │   ├── index.ts
│   │   ├── BashImpl.ts
│   │   ├── config.ts
│   │   ├── validator.ts
│   │   ├── pathHandler.ts
│   │   └── __tests__/
│   │
│   └── wsl/                       # WSL module
│       ├── index.ts
│       ├── WslImpl.ts
│       ├── config.ts
│       ├── validator.ts
│       ├── pathHandler.ts
│       └── __tests__/
│
├── utils/                         # Shared utilities
│   ├── configMerger.ts            # Configuration merging
│   ├── toolSchemas.ts             # Tool schema generation
│   └── toolDescription.ts         # Tool descriptions
│
├── build/                         # Build configuration
│   ├── shell-config.ts            # Build-time shell selection
│   └── presets/                   # Preset configurations
│       ├── full.ts                # All shells
│       ├── windows.ts             # Windows shells only
│       ├── unix.ts                # Unix shells only
│       ├── gitbash-only.ts        # Git Bash only
│       └── cmd-only.ts            # CMD only
│
└── index.ts                       # Main entry point
```

### Shell Plugin Interface

Each shell module implements a standard interface:

```typescript
// src/shells/base/ShellInterface.ts
export interface ShellPlugin {
  /** Unique shell identifier */
  readonly shellType: string;

  /** Shell display name */
  readonly displayName: string;

  /** Default configuration */
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

  /** Execute a command */
  executeCommand(
    command: string,
    options: ExecutionOptions
  ): Promise<ExecutionResult>;

  /** Merge configuration */
  mergeConfig(
    base: ShellConfig,
    override: Partial<ShellConfig>
  ): ShellConfig;

  /** Get additional blocked commands for this shell */
  getBlockedCommands(): string[];

  /** Get shell-specific tool schema additions */
  getToolSchemaExtensions(): Record<string, any>;
}
```

### Build Configuration System

```typescript
// src/build/shell-config.ts
export interface BuildConfig {
  /** Shells to include in this build */
  includedShells: string[];

  /** Build name/identifier */
  buildName: string;

  /** Whether to include all shells (overrides includedShells) */
  includeAll?: boolean;
}

// Build config from environment or config file
export function getBuildConfig(): BuildConfig {
  const preset = process.env.SHELL_BUILD_PRESET;

  if (preset && presets[preset]) {
    return presets[preset];
  }

  const shellsEnv = process.env.INCLUDED_SHELLS;
  if (shellsEnv) {
    return {
      includedShells: shellsEnv.split(',').map(s => s.trim()),
      buildName: 'custom'
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

### Shell Registration System

```typescript
// src/core/registry.ts
export class ShellRegistry {
  private shells: Map<string, ShellPlugin> = new Map();

  /** Register a shell plugin */
  register(shell: ShellPlugin): void {
    if (this.shells.has(shell.shellType)) {
      throw new Error(`Shell ${shell.shellType} already registered`);
    }
    this.shells.set(shell.shellType, shell);
  }

  /** Get a registered shell */
  getShell(shellType: string): ShellPlugin | undefined {
    return this.shells.get(shellType);
  }

  /** Get all registered shells */
  getAllShells(): ShellPlugin[] {
    return Array.from(this.shells.values());
  }

  /** Get available shell types */
  getShellTypes(): string[] {
    return Array.from(this.shells.keys());
  }
}

export const shellRegistry = new ShellRegistry();
```

### Build-Time Module Selection

```typescript
// src/shells/index.ts
import { shellRegistry } from '../core/registry';
import { getBuildConfig } from '../build/shell-config';

const buildConfig = getBuildConfig();

// Conditional imports based on build configuration
if (buildConfig.includeAll || buildConfig.includedShells.includes('powershell')) {
  const { PowerShellPlugin } = await import('./powershell');
  shellRegistry.register(new PowerShellPlugin());
}

if (buildConfig.includeAll || buildConfig.includedShells.includes('cmd')) {
  const { CmdPlugin } = await import('./cmd');
  shellRegistry.register(new CmdPlugin());
}

if (buildConfig.includeAll || buildConfig.includedShells.includes('gitbash')) {
  const { GitBashPlugin } = await import('./gitbash');
  shellRegistry.register(new GitBashPlugin());
}

if (buildConfig.includeAll || buildConfig.includedShells.includes('bash')) {
  const { BashPlugin } = await import('./bash');
  shellRegistry.register(new BashPlugin());
}

if (buildConfig.includeAll || buildConfig.includedShells.includes('wsl')) {
  const { WslPlugin } = await import('./wsl');
  shellRegistry.register(new WslPlugin());
}

export { shellRegistry };
```

### Dynamic Type Generation

```typescript
// src/build/types-generator.ts
// Generate TypeScript types based on included shells

import { getBuildConfig } from './shell-config';

const config = getBuildConfig();

// Generate union type of included shells
export type ShellType =
  ${config.includedShells.map(s => `'${s}'`).join(' | ')};

// This can be generated at build time and written to a .d.ts file
```

### Rollup/Build Tool Integration

```javascript
// rollup.config.js or vite.config.js
import { defineConfig } from 'vite';
import { getBuildConfig } from './src/build/shell-config';

export default defineConfig({
  define: {
    // Inject build config as constants for tree-shaking
    'process.env.INCLUDED_SHELLS': JSON.stringify(
      getBuildConfig().includedShells
    ),
    'process.env.BUILD_NAME': JSON.stringify(
      getBuildConfig().buildName
    ),
  },
  build: {
    // Enable tree-shaking
    treeshake: {
      moduleSideEffects: false,
    },
  },
});
```

## Migration Strategy

### Phase 1: Extract Shell Implementations (No Breaking Changes)

1. Create new shell module directories
2. Extract shell-specific code into modules
3. Implement ShellPlugin interface for each shell
4. Keep existing code working alongside new modules
5. Add comprehensive tests for each module

### Phase 2: Implement Registry System

1. Create ShellRegistry class
2. Implement dynamic registration
3. Update core system to use registry
4. Maintain backward compatibility

### Phase 3: Build Configuration

1. Implement build configuration system
2. Create preset configurations
3. Add environment variable support
4. Document build options

### Phase 4: Enable Conditional Imports

1. Implement conditional module loading
2. Test with different build configurations
3. Verify tree-shaking works correctly
4. Measure bundle size reductions

### Phase 5: Cleanup and Optimization

1. Remove old monolithic code
2. Optimize module boundaries
3. Complete documentation
4. Create migration guide

## Build Presets

### Full Build (Default)

```bash
SHELL_BUILD_PRESET=full npm run build
# Includes: PowerShell, CMD, Git Bash, Bash, WSL
# Use case: General purpose, all users
```

### Windows Build

```bash
SHELL_BUILD_PRESET=windows npm run build
# Includes: PowerShell, CMD, Git Bash
# Use case: Windows-only environments
```

### Unix Build

```bash
SHELL_BUILD_PRESET=unix npm run build
# Includes: Bash
# Use case: Linux/macOS environments
```

### Git Bash Only

```bash
SHELL_BUILD_PRESET=gitbash-only npm run build
# Includes: Git Bash
# Use case: Windows users with Git Bash
```

### CMD Only

```bash
SHELL_BUILD_PRESET=cmd-only npm run build
# Includes: CMD
# Use case: Traditional Windows users
```

### Custom Build

```bash
INCLUDED_SHELLS=gitbash,powershell npm run build
# Includes: Git Bash, PowerShell
# Use case: Custom combinations
```

## Expected Outcomes

### Bundle Size Comparison

| Build Type | Estimated Size | Reduction |
|------------|---------------|-----------|
| Full (all shells) | 100% (baseline) | - |
| Windows (3 shells) | ~60% | 40% |
| Git Bash only | ~40% | 60% |
| CMD only | ~35% | 65% |

#### Note: Actual sizes depend on shared code and dependencies

### Performance Improvements

- **Startup Time**: 20-30% faster for single-shell builds
- **Memory Usage**: 30-40% reduction for specialized builds
- **Type Checking**: Faster builds due to reduced type complexity

## Testing Strategy

### Unit Tests

- Each shell module has its own test suite
- Tests run only for included shells
- Shared utilities tested independently

### Integration Tests

- Test different build configurations
- Verify registry system works correctly
- Ensure tool schemas generate properly

### Build Tests

- Verify tree-shaking works
- Test all preset configurations
- Measure bundle sizes

## Risk Mitigation

### Backward Compatibility

- Keep existing full build as default
- Gradual migration path
- Clear deprecation notices

### Type Safety

- Generate types at build time
- Strict TypeScript configuration
- Comprehensive type tests

### Documentation

- Clear migration guide
- Updated API documentation
- Build configuration examples

## Future Extensions

### Plugin System

- External shell plugins
- Community-contributed shells
- Dynamic plugin loading

### Per-Shell Features

- Shell-specific MCP tools
- Advanced shell capabilities
- Custom validation rules

### Build Optimization

- Lazy loading of shells
- Runtime plugin system
- Hybrid builds (core + plugins)

## Conclusion

This modular architecture provides a clear path to build-time shell inclusion/exclusion while maintaining the existing system's strengths. The phased implementation approach ensures backward compatibility while progressively introducing modularity. The result is a more maintainable, flexible, and efficient codebase that better serves users with specific shell requirements.
