# WCLI0 Modular Shell Architecture - Implementation Plan

## Executive Summary

This document outlines a modular architecture for the WCLI0 MCP server that enables **build-time inclusion/exclusion** of shell implementations. This allows creating specialized builds containing only needed shells (e.g., Git Bash-only or CMD-only), resulting in **30-65% smaller bundle sizes**, reduced complexity, and easier maintenance.

**Estimated Timeline**: 8-10 weeks  
**Status**: Planning & Documentation Phase  
**Backward Compatible**: Yes (full build maintains 100% compatibility)

## Goals and Benefits

### Primary Goals

1. **Build-Time Modularity** - Include/exclude shells at build time via configuration
2. **Code Elimination** - Tree-shaking removes unused shell implementations
3. **Type Safety** - Maintain TypeScript type safety for included shells only
4. **Backward Compatibility** - Keep existing full-featured builds working
5. **Developer Experience** - Make it easy to create specialized builds

### Expected Benefits

| Use Case | Build Preset | Bundle Size Reduction | Shells |
|----------|--------------|----------------------|--------|
| Windows Developer (All) | `windows` | ~40% | PowerShell, CMD, Git Bash |
| Git Bash User | `gitbash-only` | ~60% | Git Bash only |
| CMD User | `cmd-only` | ~65% | CMD only |
| Linux/WSL User | `unix` | ~60% | Bash |
| General Purpose | `full` | - | All shells |

**Additional Benefits**:

- 20-30% faster startup for single-shell builds
- 30-40% memory reduction for specialized builds
- Clearer code organization
- Easier testing of specific shells
- Ability to deprecate shells without breaking existing deployments

## Proposed Architecture

### Design Principles

1. **Plugin-Based Architecture** - Each shell is a self-contained module/plugin
2. **Build Configuration** - Use environment variables or build config to select shells
3. **Dynamic Registration** - Shells register themselves with core system
4. **Interface-Driven** - All shells implement a common interface
5. **Zero Runtime Overhead** - Excluded shells have zero runtime footprint

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
│   │   └── __tests__/             # Shell-specific tests
│   │
│   ├── cmd/                       # CMD module
│   ├── gitbash/                   # Git Bash module
│   ├── bash/                      # Bash/WSL module
│   └── wsl/                       # WSL module
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

```typescript
// src/shells/base/ShellInterface.ts
export interface ShellPlugin {
  readonly shellType: string;
  readonly displayName: string;
  readonly defaultConfig: ShellConfig;

  validateCommand(command: string, context: ValidationContext): ValidationResult;
  validatePath(path: string, context: ValidationContext): ValidationResult;
  executeCommand?(command: string, options: ExecutionOptions): Promise<ExecutionResult>;
  getBlockedCommands(): string[];
  getToolSchemaExtensions?(): Record<string, any>;
  mergeConfig(base: ShellConfig, override: Partial<ShellConfig>): ShellConfig;
}
```

### Shell Registry System

```typescript
// src/core/registry.ts
export class ShellRegistry {
  private shells: Map<string, ShellPlugin> = new Map();

  register(shell: ShellPlugin): void {
    if (this.shells.has(shell.shellType)) {
      console.warn(`Shell ${shell.shellType} already registered`);
      return;
    }
    this.shells.set(shell.shellType, shell);
  }

  getShell(shellType: string): ShellPlugin | undefined {
    return this.shells.get(shellType);
  }

  getAllShells(): ShellPlugin[] {
    return Array.from(this.shells.values());
  }

  getShellTypes(): string[] {
    return Array.from(this.shells.keys());
  }
}

export const shellRegistry = new ShellRegistry();
```

### Build Configuration System

```typescript
// src/build/shell-config.ts
export interface BuildConfig {
  includedShells: string[];
  buildName: string;
  includeAll?: boolean;
}

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

if (buildConfig.includeAll || buildConfig.includedShells.includes('gitbash')) {
  const { GitBashPlugin } = await import('./gitbash');
  shellRegistry.register(new GitBashPlugin());
}

// ... other shells

export { shellRegistry };
```

## Implementation Phases

### Phase 1: Foundation & Infrastructure (1 week)

**Goal**: Set up foundational structure without breaking existing functionality

**Tasks**:

1. Create directory structure (`shells/`, `core/`, `build/`)
2. Define `ShellInterface` and `ValidationContext` interfaces
3. Create `BaseShell` abstract class
4. Implement `ShellRegistry` class
5. Write foundation tests

**Deliverables**:

- [ ] Directory structure created
- [ ] ShellInterface defined
- [ ] BaseShell implementation complete
- [ ] ShellRegistry implemented
- [ ] All foundation tests passing

**Key Code**:

```typescript
// src/shells/base/BaseShell.ts
export abstract class BaseShell implements ShellPlugin {
  abstract readonly shellType: string;
  abstract readonly displayName: string;
  abstract readonly defaultConfig: ShellConfig;

  validateCommand(command: string, context: ValidationContext): ValidationResult {
    const blockedCommands = [
      ...this.getBlockedCommands(),
      ...(context.blockedCommands || [])
    ];

    const commandName = command.trim().split(/\s+/)[0].toLowerCase();
    if (blockedCommands.includes(commandName)) {
      return {
        valid: false,
        errors: [`Command '${commandName}' is blocked for ${this.shellType}`]
      };
    }

    return { valid: true };
  }

  validatePath(path: string, context: ValidationContext): ValidationResult {
    return { valid: true }; // Override in subclasses
  }

  abstract getBlockedCommands(): string[];

  mergeConfig(base: ShellConfig, override: Partial<ShellConfig>): ShellConfig {
    return {
      ...base,
      ...override,
      security: { ...base.security, ...(override.security || {}) },
      restrictions: { ...base.restrictions, ...(override.restrictions || {}) }
    };
  }
}
```

### Phase 2: Shell Module Extraction (2-3 weeks)

**Goal**: Extract each shell implementation into its own module

**Tasks**:

1. Extract PowerShell module from existing code
2. Extract CMD module
3. Extract Git Bash module
4. Extract Bash module
5. Extract WSL module
6. Write shell-specific tests for each module

**Deliverables**:

- [ ] PowerShell module complete with tests
- [ ] CMD module complete with tests
- [ ] Git Bash module complete with tests
- [ ] Bash module complete with tests
- [ ] WSL module complete with tests
- [ ] All extracted tests passing

**Example Implementation**:

```typescript
// src/shells/gitbash/GitBashImpl.ts
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
    return ['rm -rf /', 'mkfs', 'dd', 'wget', 'curl'];
  }

  validatePath(path: string): ValidationResult {
    // Git Bash supports both Unix and Windows paths
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

### Phase 3: Registry & Dynamic Loading (1 week)

**Goal**: Implement dynamic shell registration system

**Tasks**:

1. Implement shell loader with conditional imports
2. Update CLIServer to use registry
3. Update tool generation to query registry
4. Update validation to use registry
5. Write integration tests

**Deliverables**:

- [ ] Shell loader implemented
- [ ] CLIServer updated to use registry
- [ ] Tool generation uses registry
- [ ] All integration tests passing

**Key Code**:

```typescript
// src/shells/loader.ts
export async function loadShells(config: LoaderConfig): Promise<void> {
  for (const shellType of config.shells) {
    let plugin: ShellPlugin | null = null;

    switch (shellType) {
      case 'powershell': {
        const { PowerShellPlugin } = await import('./powershell');
        plugin = new PowerShellPlugin();
        break;
      }
      case 'gitbash': {
        const { GitBashPlugin } = await import('./gitbash');
        plugin = new GitBashPlugin();
        break;
      }
      // ... other shells
    }

    if (plugin) {
      shellRegistry.register(plugin);
      if (config.verbose) {
        console.log(`✓ Loaded shell: ${plugin.displayName}`);
      }
    }
  }
}
```

### Phase 4: Build Configuration System (1 week)

**Goal**: Enable build-time shell selection

**Tasks**:

1. Create build config system
2. Create preset configurations
3. Implement environment variable support
4. Update build scripts
5. Test different build configurations

**Deliverables**:

- [ ] Build config system implemented
- [ ] Presets created (full, windows, unix, gitbash-only, cmd-only)
- [ ] Environment variables working
- [ ] Build scripts updated
- [ ] All build configs tested

**Build Presets**:

```typescript
// src/build/presets/gitbash-only.ts
export default {
  buildName: 'gitbash-only',
  includedShells: ['gitbash']
};

// src/build/presets/windows.ts
export default {
  buildName: 'windows',
  includedShells: ['powershell', 'cmd', 'gitbash']
};
```

**Package.json Scripts**:

```json
{
  "scripts": {
    "build": "npm run build:full",
    "build:full": "SHELL_BUILD_PRESET=full npm run compile",
    "build:windows": "SHELL_BUILD_PRESET=windows npm run compile",
    "build:gitbash": "SHELL_BUILD_PRESET=gitbash-only npm run compile",
    "build:cmd": "SHELL_BUILD_PRESET=cmd-only npm run compile",
    "build:unix": "SHELL_BUILD_PRESET=unix npm run compile",
    "build:custom": "npm run compile",
    "compile": "tsc && shx chmod +x dist/index.js"
  }
}
```

### Phase 5: Testing & Validation (1-2 weeks)

**Goal**: Comprehensive testing of modular system

**Tasks**:

1. Write unit tests for each shell module
2. Write integration tests for registry
3. Write build-specific tests
4. Measure bundle sizes
5. Performance testing

**Deliverables**:

- [ ] All unit tests passing (≥95% coverage)
- [ ] Integration tests passing
- [ ] Build tests passing
- [ ] Bundle size measurements documented
- [ ] Performance benchmarks complete

**Coverage Requirements**:

- Shell modules: ≥95%
- Core registry: ≥95%
- Build config: ≥90%
- Overall: ≥90%

### Phase 6: Documentation & Migration (1 week)

**Goal**: Complete documentation and migration guides

**Tasks**:

1. Update API documentation
2. Write migration guide
3. Create user guide
4. Update README
5. Create examples

**Deliverables**:

- [ ] API documentation complete
- [ ] Migration guide complete
- [ ] User guide complete
- [ ] README updated
- [ ] Examples created

### Phase 7: Cleanup & Optimization (1 week)

**Goal**: Remove old code and optimize

**Tasks**:

1. Remove old monolithic shell code
2. Optimize module boundaries
3. Final performance tuning
4. Update CI/CD pipelines
5. Release

**Deliverables**:

- [ ] Old code removed
- [ ] Bundle sizes optimized
- [ ] CI/CD updated
- [ ] Version tagged and released

## Build Examples

Once implemented, specialized builds can be created:

```bash
# Build with all shells (default)
npm run build

# Build for Windows users only
npm run build:windows

# Build for Git Bash users only
npm run build:gitbash

# Build for CMD users only
npm run build:cmd

# Build for Unix/Linux users only
npm run build:unix

# Custom build with specific shells
INCLUDED_SHELLS=gitbash,powershell npm run build:custom
```

## Migration Strategy

### Backward Compatibility

- Default build includes all shells (zero breaking changes)
- Existing configurations continue to work
- Gradual migration path available
- Clear deprecation notices if needed

### Migration Phases

1. **Phase 1-4**: No breaking changes, new code alongside old
2. **Phase 5-6**: Testing and documentation, still backward compatible
3. **Phase 7**: Remove old code, full migration complete

### Rollback Plan

- Keep old code during Phases 1-6
- Tag releases for easy rollback
- Maintain backward-compatible branch
- Clear rollback documentation

## Success Criteria

### Technical Metrics

- ✅ Bundle size reduction: 30-65% for specialized builds
- ✅ Zero runtime overhead for excluded shells
- ✅ 100% type safety maintained
- ✅ No breaking changes for full builds
- ✅ Test coverage ≥90%

### Business Metrics

- ✅ Easier onboarding for single-shell users
- ✅ Reduced support burden
- ✅ Better developer experience
- ✅ Clearer upgrade/migration path

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Breaking changes | Keep full build as default, maintain backward compatibility |
| Performance regression | Comprehensive benchmarking, no dynamic loading at runtime |
| Type safety issues | Strict TypeScript config, comprehensive type tests |
| Migration complexity | Clear guides, gradual migration, old code remains during transition |
| Test coverage gaps | ≥90% coverage requirement, build-specific tests |

## Timeline

| Phase | Duration | Start | End |
|-------|----------|-------|-----|
| Phase 1: Foundation | 1 week | Week 1 | Week 1 |
| Phase 2: Shell Extraction | 2-3 weeks | Week 2 | Week 4 |
| Phase 3: Registry | 1 week | Week 5 | Week 5 |
| Phase 4: Build Config | 1 week | Week 6 | Week 6 |
| Phase 5: Testing | 1-2 weeks | Week 7 | Week 8 |
| Phase 6: Documentation | 1 week | Week 9 | Week 9 |
| Phase 7: Cleanup | 1 week | Week 10 | Week 10 |

**Total**: 8-10 weeks

## Next Steps

1. **Review**: Stakeholder review of this plan
2. **Approval**: Get approval to proceed
3. **Setup**: Create GitHub issues/project board
4. **Kickoff**: Begin Phase 1 implementation

---

**Last Updated**: 2025-11-10  
**Status**: Ready for Implementation  
**See Also**: MODULAR_USAGE.md, TESTING_STRATEGY.md
