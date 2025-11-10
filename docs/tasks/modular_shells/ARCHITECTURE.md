# WCLI0 Current Shell Architecture

## Overview

This document provides comprehensive technical documentation of the current WCLI0 shell architecture, including implementation details, architecture patterns, and visual diagrams.

**Repository**: WCLI0 Windows CLI MCP Server  
**Language**: TypeScript (ES Modules)  
**Supported Shells**: 5 (PowerShell, CMD, Git Bash, Bash, WSL)

## Quick Facts

- **Source Files**: 19 TypeScript files in src/
- **Test Files**: 56 test files covering all shells
- **Build System**: TypeScript + Jest
- **Entry Point**: src/index.ts → dist/index.js
- **Module Type**: ES Modules (ES2020 target)

## Supported Shells

| Shell | Type | Path Format | Classification | Special Features |
|-------|------|-------------|----------------|------------------|
| PowerShell | `powershell` | Windows (C:\Path) | Windows | Standard Windows shell |
| CMD | `cmd` | Windows (C:\Path) | Windows | Blocks: del, rd, rmdir |
| Git Bash | `gitbash` | Mixed (both) | Unix | Blocks: rm, custom path validator |
| Bash | `bash` | Unix (/mnt/c/path) | Unix + WSL | WSL mount point config |
| WSL | `wsl` | Unix (/mnt/c/path) | Unix + WSL | WSL mount point config |

## Core Implementation Files

### Type System

**File**: `src/types/config.ts`

**Key Types**:

- `ShellType` = 'cmd' | 'powershell' | 'gitbash' | 'wsl' | 'bash'
- `BaseShellConfig` (lines 146-170) - Basic shell configuration
- `WslShellConfig` (lines 190-196) - WSL-specific config
- `ResolvedShellConfig` (lines 223-259) - Final resolved configuration

### Configuration Management

**File**: `src/utils/config.ts`

- `DEFAULT_CONFIG` (lines 26-118) - All 5 shells pre-configured
- `loadConfig()` - Loads from file or uses defaults
- `getResolvedShellConfig()` - Resolves individual shell config
- Validation and normalization

**File**: `src/utils/configMerger.ts`

- `resolveShellConfiguration()` - Merges global + shell overrides
- `applyWslPathInheritance()` (lines 132-159) - WSL path conversion

### Validation & Context

**File**: `src/utils/validationContext.ts`

- `ValidationContext` interface (lines 6-12)
- `createValidationContext()` - Creates context from shell config
- Shell classification:
  - `isWindowsShell`: cmd, powershell
  - `isUnixShell`: gitbash, wsl, bash
  - `isWslShell`: wsl, bash

**File**: `src/utils/validation.ts`

- `extractCommandName()` - Shell-agnostic command extraction
- `isCommandBlocked()`, `isArgumentBlocked()` - Security checks
- `validateShellOperators()` - Operator validation

**File**: `src/utils/pathValidation.ts`

- `normalizePathForShell()` - Shell-specific path normalization
- `validateWorkingDirectory()` - Shell-aware directory validation
- `validateWslPath()`, `validateWindowsPath()`, `validateUnixPath()`

### Execution

**File**: `src/index.ts`

**Main Components**:

- CLIServer class - Main server implementation
- `executeShellCommand()` (lines 302-479) - Core shell execution logic
- `initializeShellConfigs()` (lines 173-182) - Shell registration
- Dynamic tool generation (lines 698-757)

**Special Handling**:

- WSL/bash: Parse and split command args
- Git Bash: Mixed path handling
- Windows: Direct command passing

### Tool Generation

**File**: `src/utils/toolSchemas.ts`

- `buildExecuteCommandSchema()` (lines 13-69) - Dynamic schema with enabled shells enum

**File**: `src/utils/toolDescription.ts`

- `buildExecuteCommandDescription()` - Shell-specific tool descriptions
- `buildToolDescription()` - Alternative description builder

## Architecture Diagrams

### Shell Classification

```text
                Windows Shells          Unix-Like Shells       Unix + WSL
                ══════════════          ════════════════       ══════════
                
                powershell              gitbash               bash
                ├─ Windows paths        ├─ Mixed paths        ├─ Unix paths
                ├─ .exe execution       ├─ /c/path format     ├─ /mnt/c/path
                └─ Standard args        └─ Custom validator   ├─ WSL-specific
                                                               └─ Mount point
                cmd                                           
                ├─ Windows paths                              wsl
                ├─ /c execution                               ├─ Unix paths
                └─ Custom override                            ├─ wsl.exe runner
                                                               ├─ WSL-specific
                                                               └─ Mount point
```

### Configuration Hierarchy

```text
                        DEFAULT_CONFIG
                        (All 5 shells)
                              │
                              ├─ Load from file ────> User Config
                              │
                              └─ Merge ────────────> CLI Args Override
                                     │
                                     └─> ResolvedShellConfig (per shell)
```

### Shell Resolution Flow

```text
1. CLIServer.__init__()
   │
   └─ initializeShellConfigs()
      │
      ├─ For each shell in config:
      │  │
      │  └─ if shell.enabled:
      │     │
      │     └─ getResolvedShellConfig(name)
      │        │
      │        └─ Merge:
      │           ├─ Global config
      │           └─ Shell overrides
      │              │
      │              └─ Store in resolvedConfigs Map
```

### Command Execution Pipeline

```text
execute_command tool
├─ shell (enum of enabled shells)
├─ command (string)
├─ workingDir (optional)
└─ maxOutputLines (optional)
    │
    └─ Validation Context Created
        │
        └─ Path Normalization
        │  ├─ Windows shells: C:\Path format
        │  ├─ Unix shells: /path format
        │  └─ WSL shells: /mnt/c/path format
        │
        └─ Command Validation
        │  ├─ Check blocked operators
        │  ├─ Check blocked commands
        │  └─ Check blocked arguments
        │
        └─ Path Validation
        │  ├─ Check allowed paths
        │  └─ Shell-specific validation
        │
        └─ executeShellCommand()
           │
           ├─ If WSL/bash:
           │  ├─ Parse command into args
           │  ├─ Normalize paths
           │  └─ Pass via environment var
           │
           ├─ Else if gitbash:
           │  └─ Use mixed path handling
           │
           └─ Else (Windows):
              └─ Use Windows paths directly
                  │
                  └─ spawn(executable, args, {cwd, env})
                     │
                     └─ Collect stdout/stderr
                        │
                        └─ Return result
```

### Shell-Specific Behavior

| Aspect | Windows | GitBash | WSL/Bash |
|--------|---------|---------|----------|
| Path Format | C:\Path | Mixed | /mnt/c/path |
| Executable | .exe args | bash -c | bash -c |
| Args Style | Full string | Full string | Split args |
| Validation | Windows path | Regex check | WSL path check |
| Blocked Cmds | Global only | Global + rm | Global only |
| Special Config | None | None | wslConfig |
| Mount Point | N/A | N/A | /mnt/ (config) |

### Execution Strategy by Shell

| Shell Type | Execution Strategy |
|------------|-------------------|
| cmd | `cmd.exe /c "command"` |
| powershell | `powershell.exe -Command "command"` |
| gitbash | `bash.exe -c "command"` |
| bash | `bash -c command arg1 arg2` |
| wsl | `wsl.exe -e bash -c command arg1 arg2` |

**Note:** WSL/bash split args for better shell parsing, others pass full command string

## Architecture Patterns

### 1. Configuration-Driven Design

All shells defined declaratively in configuration:

```typescript
// src/utils/config.ts
export const DEFAULT_CONFIG = {
  shells: {
    powershell: {
      enabled: true,
      executable: 'powershell.exe',
      args: ['-NoProfile', '-Command'],
      // ... full config
    },
    // ... other shells
  }
};
```

**Benefits**:

- No hardcoded shell paths
- Easy to enable/disable shells
- Extensible for new shells
- Runtime behavior determined by config

### 2. Shell Classification System

Shells are classified into categories:

```typescript
// Windows Shells
isWindowsShell = (type === 'cmd' || type === 'powershell')

// Unix Shells  
isUnixShell = (type === 'gitbash' || type === 'wsl' || type === 'bash')

// WSL-Specific
isWslShell = (type === 'wsl' || type === 'bash')
```

**Classification determines**:

- Expected path format
- Path validation rules
- Path normalization behavior
- Command execution strategy

### 3. Context-Based Validation

```typescript
interface ValidationContext {
  shellName: string;
  shellConfig: ResolvedShellConfig;
  isWindowsShell: boolean;
  isUnixShell: boolean;
  isWslShell: boolean;
}
```

**Benefits**:

- Validation rules vary per shell
- Path handling adapts to shell type
- Commands checked per shell rules
- No shell-specific branches in validation logic

### 4. Dynamic Tool Generation

```typescript
// Only enabled shells appear in MCP tool schemas
buildExecuteCommandSchema(enabledShells) {
  return {
    shell: {
      type: 'string',
      enum: enabledShells.map(s => s.name)
    }
    // ...
  }
}
```

**Benefits**:

- Schema matches configuration
- Descriptions change per enabled shells
- Examples shown for available shells only

### 5. Layered Configuration

```text
CLI Args (highest priority)
    ↓
User Config File
    ↓
DEFAULT_CONFIG (lowest priority)
    ↓
ResolvedShellConfig (final result)
```

Each shell config can have overrides:

- Security settings
- Blocked commands/args/operators
- Allowed paths
- Custom path validators

## File Dependencies

```text
src/index.ts (CLIServer)
├─> src/utils/config.ts
│   ├─> src/types/config.ts
│   ├─> src/utils/configMerger.ts
│   │   └─> src/utils/configTypes.ts
│   └─> src/utils/validation.ts
├─> src/utils/validationContext.ts
│   └─> src/types/config.ts
├─> src/utils/pathValidation.ts
│   ├─> src/utils/validationContext.ts
│   └─> src/utils/validation.ts
├─> src/utils/toolSchemas.ts
│   └─> src/types/config.ts
└─> src/utils/toolDescription.ts
    └─> src/types/config.ts
```

## Shell Customization Points

### 1. Custom Path Validators

Each shell can define a custom path validator:

```typescript
interface BaseShellConfig {
  validatePath?: (dir: string) => boolean;
}

// Example: Git Bash custom validator
gitbash: {
  validatePath: (dir) => /^([a-zA-Z]:\\|\/[a-z]\/)/.test(dir)
}
```

### 2. Shell-Specific Overrides

```typescript
interface ShellOverrides {
  security?: SecuritySettings;
  restrictions?: {
    blockedCommands?: string[];
    blockedArguments?: string[];
    blockedOperators?: string[];
  };
  paths?: {
    allowedPaths?: string[];
  };
}
```

### 3. WSL Configuration

```typescript
interface WslSpecificConfig {
  mountPoint: string;          // e.g., '/mnt/'
  inheritGlobalPaths: boolean; // Convert Windows paths
}
```

### 4. Default Blocked Commands

Per-shell blocked commands defined in config:

```typescript
// CMD specific
blockedCommands: ['del', 'rd', 'rmdir']

// Git Bash specific
blockedCommands: ['rm']

// PowerShell/Bash/WSL use global only
```

## Test Organization

### Test Categories

```text
tests/
├── bash/                      # Bash execution tests
│   └── bashShell.test.ts
├── wsl/                       # WSL-specific tests
│   ├── pathConversion.test.ts
│   ├── pathResolution.test.ts
│   ├── validateWslWorkingDirectory.test.ts
│   └── isWslPathAllowed.test.ts
├── validation/                # Validation tests
│   ├── shellSpecific.test.ts
│   ├── context.test.ts
│   └── pathValidation.test.ts
├── unit/                      # Unit tests
│   └── folderPropagation.test.ts
├── integration/               # Integration tests
│   └── shellExecution.test.ts
├── gitbashWorkingDir.test.ts  # Git Bash paths
├── conditionalShells.test.ts  # Shell enable/disable
└── shellCliOverride.test.ts   # CLI shell overrides
```

**56 total test files** covering:

- Shell-specific execution
- Path normalization and validation
- Configuration loading and merging
- CLI argument processing
- End-to-end integration

## Build & Deployment

### Package Configuration

```json
{
  "type": "module",
  "bin": {
    "wcli0": "dist/index.js"
  }
}
```

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

### Build Scripts

```bash
npm run build   # tsc && shx chmod +x dist/index.js
npm run clean   # shx rm -rf dist
npm run start   # node dist/index.js
npm test        # jest
```

### CLI Arguments

```bash
--config <path>           # Path to config file
--init-config <path>      # Create default config
--initialDir <path>       # Override initial directory
--shell <name>            # Enable only specific shell
--allowedDir <path>       # Override allowed directories (array)
--maxCommandLength <num>  # Override max command length
--commandTimeout <num>    # Override command timeout (seconds)
--wslMountPoint <path>    # Override WSL mount point
--blockedCommand <cmd>    # Override blocked commands (array)
--blockedArgument <arg>   # Override blocked arguments (array)
--blockedOperator <op>    # Override blocked operators (array)
--allowAllDirs            # Disable directory restriction
--debug                   # Enable debug logging
```

## Key Insights

### Strengths

1. **Already Well-Modularized**: Clear separation of concerns across utils
2. **Configuration-Driven**: Shell behavior from config, not hardcoded
3. **Type-Safe**: Strong TypeScript types throughout
4. **Extensible**: Easy to add new shells or features
5. **Well-Tested**: Comprehensive test coverage

### Modularization Readiness

The codebase is ready for further restructuring:

1. **Logical Separation**: Concerns separated into focused modules
2. **Clear Dependencies**: Import patterns show module relationships
3. **Configuration Abstraction**: Shell details in config, not implementation
4. **Dynamic Behavior**: Type-based branching for shell differences
5. **Test Coverage**: Tests support refactoring

### Improvement Opportunities

1. Extract shell execution logic into separate handlers per type
2. Create explicit Shell interface and implementations
3. Move shell-specific path validation to separate modules
4. Create shell factory pattern for instantiation
5. Separate tool generation into dedicated module
6. Extract validation logic into chainable validators

## Configuration Examples

Available in `config.examples/`:

- `config.sample.json` - Standard configuration
- `config.development.json` - Dev environment
- `config.secure.json` - High-security setup
- `emptyRestrictions.json` - No restrictions
- `minimal.json` - Minimal config
- `production.json` - Production setup

Each config demonstrates:

- Global security settings
- Global restrictions
- Shell-specific overrides
- Path configurations
- WSL-specific settings

## Summary

The WCLI0 codebase demonstrates a **well-designed, modular architecture** for managing multiple shell environments:

- **Configuration-driven** - All shells defined declaratively
- **Type-safe** - Strong TypeScript typing
- **Context-based validation** - Shell type determines rules
- **Dynamic tool generation** - Only enabled shells in schemas
- **Layered configuration** - Global + overrides + CLI args
- **Functional modules** - Clear separation of concerns
- **Extensible design** - New shells via types and config

The system is production-ready with comprehensive testing (56 files) and clear documentation patterns.

---

**Last Updated**: 2025-11-10  
**Status**: Production  
**Next Steps**: See MODULAR_PLAN.md for proposed enhancements
